/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  meet,
  MeetSidePanelClient,
} from '@googleworkspace/meet-addons/meet.addons';

interface GeminiAnalysis {
  summary: string;
  semantics: string;
  questions: string[];
}

interface Transcript {
  speaker: string;
  text: string;
  analysis?: GeminiAnalysis;
  timestamp: number;
  isFinal: boolean;
}

interface AudioMetrics {
  bytesTransmitted: number;
  packetsLost: number;
  averageLatency: number;
  connectionTime: number;
}

interface MeetingSession {
  sessionId: string;
  meetingId: string;
  startTime: Date;
  participants: string[];
}

const AUDIO_CONFIG = {
  sampleRate: 16000,
  channelCount: 1,
  bufferSize: 4096,
  encoding: 'pcm',
  bitDepth: 16
};

class MeetMediaAPICapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isCapturing = false;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private metrics: AudioMetrics = {
    bytesTransmitted: 0,
    packetsLost: 0,
    averageLatency: 0,
    connectionTime: 0
  };
  private meetClient: MeetSidePanelClient | null = null;

  constructor(
    private backendUrl: string,
    private onStatusChange: (status: string) => void,
    private onMetricsUpdate: (metrics: AudioMetrics) => void
  ) { }

  async initialize(client: MeetSidePanelClient): Promise<void> {
    this.meetClient = client;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      if (!this.meetClient) {
        throw new Error('Meet client not initialized');
      }

      const meetingInfo = await this.meetClient.getMeetingInfo();

      if (!meetingInfo.meetingId) {
        throw new Error('Not in an active meeting');
      }

      this.onStatusChange('Meet Media API available - ready for capture');
      return true;

    } catch (error: any) {
      console.error('[MeetMediaAPI] Permission check failed:', error);
      this.onStatusChange(`Media API check failed: ${error.message}`);
      return false;
    }
  }

  async startCapture(): Promise<boolean> {
    if (this.isCapturing) {
      console.log('[MeetMediaAPI] Already capturing');
      return true;
    }

    try {
      if (!this.meetClient) {
        throw new Error('Meet client not initialized');
      }

      // Connect to WebSocket first
      if (!await this.connectWebSocket()) {
        return false;
      }

      this.onStatusChange('Requesting Media API access...');

      this.mediaStream = await (this.meetClient as any).getMediaStream({
        audio: {
          sampleRate: AUDIO_CONFIG.sampleRate,
          channelCount: AUDIO_CONFIG.channelCount
        },
        video: false 
      });

      this.audioContext = new AudioContext({
        sampleRate: AUDIO_CONFIG.sampleRate
      });

      if (!this.mediaStream) {
        throw new Error('MediaStream is null');
      }
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        AUDIO_CONFIG.bufferSize,
        AUDIO_CONFIG.channelCount,
        AUDIO_CONFIG.channelCount
      );

      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      source.connect(this.analyser);
      this.analyser.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      this.scriptProcessor.onaudioprocess = this.handleAudioProcess.bind(this);

      this.isCapturing = true;
      this.metrics.connectionTime = Date.now();
      this.startHeartbeat();
      this.onStatusChange('Media API capture active - streaming meeting audio');

      console.log('[MeetMediaAPI] Capture started successfully');
      return true;

    } catch (error: any) {
      console.error('[MeetMediaAPI] Failed to start capture:', error);

      if (error.message?.includes('consent') || error.message?.includes('permission')) {
        this.onStatusChange('Waiting for participant consent to access meeting audio...');
      } else if (error.message?.includes('Media API') || error.message?.includes('not available')) {
        this.onStatusChange('Media API not available. Please ensure it is enabled in Google Admin console.');
      } else {
        this.onStatusChange(`Capture failed: ${error.message}`);
      }

      await this.stopCapture();
      return false;
    }
  }

  private handleAudioProcess(event: AudioProcessingEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const inputBuffer = event.inputBuffer.getChannelData(0);

    const int16Buffer = new Int16Array(inputBuffer.length);
    for (let i = 0; i < inputBuffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, inputBuffer[i]));
      int16Buffer[i] = sample * 0x7FFF;
    }

    try {
      this.ws.send(int16Buffer.buffer);
      this.metrics.bytesTransmitted += int16Buffer.buffer.byteLength;
      this.onMetricsUpdate(this.metrics);
    } catch (error) {
      console.error('[MeetMediaAPI] Failed to send audio data:', error);
      this.metrics.packetsLost++;
    }
  }

  private async connectWebSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const wsUrl = this.backendUrl.replace(/^http/, 'ws') + '/ws/audio';
        this.ws = new WebSocket(wsUrl);

        const connectTimeout = setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close();
            this.onStatusChange('Backend connection timeout');
            resolve(false);
          }
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(connectTimeout);
          this.reconnectAttempts = 0;
          this.onStatusChange('Backend connection established');
          console.log('[MeetMediaAPI] WebSocket connected');
          resolve(true);
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          console.log(`[MeetMediaAPI] WebSocket closed: ${event.code} - ${event.reason}`);
          this.onStatusChange('Backend connection lost');

          if (this.isCapturing && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnection();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          console.error('[MeetMediaAPI] WebSocket error:', error);
          this.onStatusChange('Backend connection error');
          resolve(false);
        };

        this.ws.onmessage = this.handleWebSocketMessage.bind(this);

      } catch (error) {
        console.error('[MeetMediaAPI] WebSocket creation failed:', error);
        this.onStatusChange('Failed to connect to backend');
        resolve(false);
      }
    });
  }

  private handleWebSocketMessage(event: MessageEvent): void {
    if (typeof event.data === 'string') {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') {
          const latency = Date.now() - data.timestamp;
          this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
        }
      } catch {
        console.debug('[MeetMediaAPI] Non-JSON message received:', event.data);
      }
    }
  }

  private attemptReconnection(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.onStatusChange(`Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      if (this.isCapturing) {
        const connected = await this.connectWebSocket();
        if (!connected && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnection();
        } else if (!connected) {
          this.onStatusChange('Max reconnection attempts reached');
          await this.stopCapture();
        }
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'ping',
          timestamp: Date.now()
        }));
      }
    }, 30000); 
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  async stopCapture(): Promise<void> {
    this.isCapturing = false;
    this.stopHeartbeat();

    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (error) {
        console.warn('[MeetMediaAPI] Error closing audio context:', error);
      }
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }

    this.onStatusChange('Media API capture stopped');
    console.log('[MeetMediaAPI] Capture stopped');
  }

  getAudioLevel(): number {
    if (!this.analyser) return 0;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    return sum / bufferLength / 255; 
  }

  isActive(): boolean {
    return this.isCapturing;
  }

  getMetrics(): AudioMetrics {
    return { ...this.metrics };
  }
}

const AIOrb = ({ isActive, size = "w-4 h-4" }: { isActive: boolean; size?: string }) => (
  <div className={`${size} rounded-full bg-gradient-to-r from-[#803ceb] to-[#a855f7] ${isActive ? 'animate-pulse shadow-lg shadow-purple-400/50' : 'opacity-50'
    } transition-all duration-300`}>
    <div className="w-full h-full rounded-full bg-gradient-to-r from-[#803ceb] to-[#a855f7] animate-spin opacity-75"></div>
  </div>
);

const StatusIndicator = ({ status, isConnected }: { status: string; isConnected: boolean }) => (
  <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-[#141244]/40 to-[#803ceb]/20 backdrop-blur-sm border border-[#803ceb]/30">
    <AIOrb isActive={isConnected} size="w-3 h-3" />
    <div className="flex-1">
      <div className="text-xs text-[#803ceb] font-medium uppercase tracking-wide">System Status</div>
      <div className="text-white/90 text-sm">{status}</div>
    </div>
  </div>
);

const AudioLevelMeter = ({ level }: { level: number }) => (
  <div className="w-full bg-[#141244] rounded-full h-2 mb-3">
    <div
      className="bg-gradient-to-r from-[#803ceb] to-[#a855f7] h-2 rounded-full transition-all duration-100"
      style={{ width: `${level * 100}%` }}
    ></div>
  </div>
);

const Button = ({
  onClick,
  children,
  variant = "primary",
  disabled = false,
  loading = false,
  className = ""
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "success";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) => {
  const baseClasses = "relative px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-gradient-to-r from-[#803ceb] to-[#a855f7] hover:from-[#7c3aed] hover:to-[#9333ea] text-white shadow-lg shadow-[#803ceb]/30 hover:shadow-[#803ceb]/50",
    secondary: "bg-gradient-to-r from-[#141244] to-[#1e1065] hover:from-[#1a1458] hover:to-[#2d1b69] text-white border border-[#803ceb]/30 hover:border-[#803ceb]/50",
    danger: "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-600/30",
    success: "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-600/30"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variants[variant]} ${className}`}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <AIOrb isActive={true} size="w-5 h-5" />
        </div>
      )}
      <span className={loading ? "opacity-0" : ""}>{children}</span>
    </button>
  );
};

const Card = ({ title, children, className = "", glowing = false }: {
  title: string;
  children: React.ReactNode;
  className?: string;
  glowing?: boolean;
}) => (
  <div className={`relative p-6 rounded-2xl bg-gradient-to-br from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md border ${glowing
    ? 'border-[#803ceb]/50 shadow-2xl shadow-[#803ceb]/20'
    : 'border-[#803ceb]/20'
    } transition-all duration-500 ${className}`}>
    {glowing && (
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#803ceb]/10 to-transparent animate-pulse"></div>
    )}
    <div className="relative z-10">
      <div className="flex items-center gap-3 mb-4">
        <AIOrb isActive={glowing} size="w-4 h-4" />
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  </div>
);

export default function SidePanel() {
  const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [status, setStatus] = useState('Initializing Recos AI...');
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [meetingSession, setMeetingSession] = useState<MeetingSession | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
    bytesTransmitted: 0,
    packetsLost: 0,
    averageLatency: 0,
    connectionTime: 0
  });
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasMediaAPIPermissions, setHasMediaAPIPermissions] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [loading, setLoading] = useState(false);

  const mediaAPICapture = useRef<MeetMediaAPICapture | null>(null);
  const transcriptWebSocket = useRef<WebSocket | null>(null);
  const audioLevelInterval = useRef<NodeJS.Timeout | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://add-on-backend.onrender.com';

  useEffect(() => {
    const initializeAddon = async () => {
      try {
        const session = await meet.addon.createAddonSession({
          cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
        });
        const client = await session.createSidePanelClient();
        setSidePanelClient(client);

        mediaAPICapture.current = new MeetMediaAPICapture(
          backendUrl,
          setStatus,
          setAudioMetrics
        );
        await mediaAPICapture.current.initialize(client);

        const meetingInfo = await client.getMeetingInfo();
        setMeetingSession({
          sessionId: `session_${Date.now()}`,
          meetingId: meetingInfo.meetingId || 'unknown',
          startTime: new Date(),
          participants: [] 
        });

        setStatus('Recos AI with Media API initialized successfully');

        client.on('frameToFrameMessage', (event) => {
          console.log('Frame to frame message:', event);
        });

      } catch (error) {
        console.error('Error initializing addon:', error);
        setStatus('Failed to initialize Recos AI Media API');
      }
    };

    initializeAddon();
  }, [backendUrl]);

  useEffect(() => {
    if (isCapturing) {
      audioLevelInterval.current = setInterval(() => {
        if (mediaAPICapture.current) {
          setAudioLevel(mediaAPICapture.current.getAudioLevel());
        }
      }, 100);
    } else {
      if (audioLevelInterval.current) {
        clearInterval(audioLevelInterval.current);
        audioLevelInterval.current = null;
      }
      setAudioLevel(0);
    }

    return () => {
      if (audioLevelInterval.current) {
        clearInterval(audioLevelInterval.current);
      }
    };
  }, [isCapturing]);

  const connectToTranscriptStream = useCallback(() => {
    if (transcriptWebSocket.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/transcripts';
    transcriptWebSocket.current = new WebSocket(wsUrl);

    transcriptWebSocket.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.message_type === 'enriched_transcript') {
          const newTranscript: Transcript = {
            speaker: data.speaker_name || 'Unknown Speaker',
            text: data.transcript,
            analysis: data.analysis,
            timestamp: Date.now(),
            isFinal: true,
          };

          setTranscripts((prev) => {
            if (prev.length > 0 && !prev[0].isFinal) {
              return [newTranscript, ...prev.slice(1)];
            }
            return [newTranscript, ...prev];
          });
        } else if (data.message_type === 'interim_transcript') {
          const interimTranscript: Transcript = {
            speaker: data.speaker_name || 'Speaker',
            text: data.transcript,
            timestamp: Date.now(),
            isFinal: false,
          };

          setTranscripts((prev) => {
            if (prev.length > 0 && !prev[0].isFinal) {
              return [interimTranscript, ...prev.slice(1)];
            }
            return [interimTranscript, ...prev];
          });
        }
      } catch (error) {
        console.error('Error processing transcript message:', error);
      }
    };

    transcriptWebSocket.current.onclose = () => {
      console.log('Transcript WebSocket closed');
      setTimeout(connectToTranscriptStream, 5000);
    };

  }, [backendUrl]);

  const requestMediaAPIPermissions = async () => {
    setLoading(true);
    try {
      if (mediaAPICapture.current) {
        const granted = await mediaAPICapture.current.requestPermissions();
        setHasMediaAPIPermissions(granted);
      }
    } finally {
      setLoading(false);
    }
  };

  const startMediaAPICapture = async () => {
    setLoading(true);
    try {
      if (mediaAPICapture.current && await mediaAPICapture.current.startCapture()) {
        setIsCapturing(true);
        connectToTranscriptStream();
      }
    } finally {
      setLoading(false);
    }
  };

  const stopCapture = async () => {
    setLoading(true);
    try {
      if (mediaAPICapture.current) {
        await mediaAPICapture.current.stopCapture();
        setIsCapturing(false);

        if (transcriptWebSocket.current) {
          transcriptWebSocket.current.close();
          transcriptWebSocket.current = null;
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const startActivity = async () => {
    if (!sidePanelClient) return;
    try {
      await sidePanelClient.startActivity({});
    } catch (error) {
      console.error('Error starting activity:', error);
    }
  };

  const getMeetingInfo = async () => {
    if (!sidePanelClient) return;
    try {
      const meetingInfo = await sidePanelClient.getMeetingInfo();
      console.log('Meeting info:', meetingInfo);
      setStatus(`Meeting: ${meetingInfo.meetingId || 'Unknown ID'}`);
    } catch (error) {
      console.error('Error getting meeting info:', error);
      setStatus('Failed to get meeting info');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (startTime: number) => {
    const duration = (Date.now() - startTime) / 1000;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141244] to-[#1a1458] text-white p-6">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#803ceb]/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#803ceb]/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#a855f7]/10 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <AIOrb isActive={hasMediaAPIPermissions} size="w-8 h-8" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-[#803ceb] bg-clip-text text-transparent">
              Recos AI
            </h1>
            <AIOrb isActive={isCapturing} size="w-8 h-8" />
          </div>
          <p className="text-white/60 text-lg">Real-time meeting intelligence with Google Meet Media API</p>
        </div>

        {/* Status Dashboard */}
        <div className="mb-8">
          <StatusIndicator status={status} isConnected={isCapturing} />
        </div>

        {/* System Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Audio Level</div>
            <AudioLevelMeter level={audioLevel} />
            <span className="text-white/90 text-sm">{Math.round(audioLevel * 100)}%</span>
          </div>

          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Data Transmitted</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={audioMetrics.bytesTransmitted > 0} size="w-2 h-2" />
              <span className="text-white/90 text-sm">{formatBytes(audioMetrics.bytesTransmitted)}</span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Latency</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={audioMetrics.averageLatency < 500} size="w-2 h-2" />
              <span className="text-white/90 text-sm">{Math.round(audioMetrics.averageLatency)}ms</span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Session Time</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={isCapturing} size="w-2 h-2" />
              <span className="text-white/90 text-sm">
                {isCapturing ? formatDuration(audioMetrics.connectionTime) : '0:00'}
              </span>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card title="Google Meet Media API" glowing={isCapturing}>
            <div className="space-y-4">
              {!hasMediaAPIPermissions ? (
                <div className="space-y-3">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                    <div className="text-blue-300 font-medium text-sm mb-1">Official Meet Media API</div>
                    <div className="text-white/70 text-xs">
                      Uses Google&apos;s official Media API to capture meeting audio.
                      Participants will see a consent prompt and can control access.
                      Ensure Media API is enabled in your Google Admin console.
                    </div>
                  </div>
                  <Button
                    onClick={requestMediaAPIPermissions}
                    loading={loading}
                    variant="primary"
                    className="w-full"
                  >
                    Initialize Meet Media API
                  </Button>
                </div>
              ) : !isCapturing ? (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                    <div className="text-green-300 font-medium text-sm mb-1">Media API Ready</div>
                    <div className="text-white/70 text-xs">
                      Meet Media API initialized. Start capture to begin streaming meeting audio.
                      Participants will be prompted for consent.
                    </div>
                  </div>
                  <Button
                    onClick={startMediaAPICapture}
                    loading={loading}
                    variant="success"
                    className="w-full"
                  >
                    Start Meet Audio Capture
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                    <div className="text-purple-300 font-medium text-sm mb-1">Media API Active</div>
                    <div className="text-white/70 text-xs">
                      Streaming meeting audio through official Google Meet Media API.
                      Participants can control access through their consent settings.
                    </div>
                  </div>
                  <Button
                    onClick={stopCapture}
                    loading={loading}
                    variant="danger"
                    className="w-full"
                  >
                    Stop Media API Capture
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card title="Meeting Controls" glowing={!!meetingSession}>
            <div className="space-y-4">
              {meetingSession && (
                <div className="bg-[#141244]/40 rounded-lg p-3 mb-4">
                  <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Session Info</div>
                  <div className="text-white/70 text-sm space-y-1">
                    <div>Meeting: {meetingSession.meetingId}</div>
                    <div>Started: {meetingSession.startTime.toLocaleTimeString()}</div>
                    <div>Participants: {meetingSession.participants.length}</div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button onClick={startActivity} variant="success">
                  Expand Interface
                </Button>
                <Button onClick={getMeetingInfo} variant="secondary">
                  Meeting Info
                </Button>
              </div>
            </div>
          </Card>
        </div>


        {/* Live Transcripts */}
        <Card title="Live Transcripts & AI Analysis" glowing={transcripts.length > 0}>
          <div className="h-96 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {transcripts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/50">
                <AIOrb isActive={isCapturing} size="w-12 h-12" />
                <p className="mt-4 text-center">
                  {isCapturing
                    ? "Listening for speech... Transcripts will appear here in real-time."
                    : "Start audio capture to see real-time transcripts and AI analysis."
                  }
                </p>
                {isCapturing && (
                  <div className="mt-2 text-xs text-white/40">
                    Make sure participants have granted Media API consent
                  </div>
                )}
              </div>
            ) : (
              transcripts.map((transcript, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-xl border transition-all duration-500 ${transcript.isFinal
                    ? 'bg-gradient-to-r from-[#141244]/40 to-[#1a1458]/20 border-[#803ceb]/30'
                    : 'bg-gradient-to-r from-[#803ceb]/10 to-[#a855f7]/5 border-[#803ceb]/50 animate-pulse'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AIOrb isActive={!transcript.isFinal} size="w-3 h-3" />
                    <span className="font-semibold text-[#803ceb]">{transcript.speaker}</span>
                    <span className="text-xs text-white/50">
                      {new Date(transcript.timestamp).toLocaleTimeString()}
                    </span>
                    {!transcript.isFinal && (
                      <span className="text-xs text-[#803ceb] bg-[#803ceb]/20 px-2 py-1 rounded-full ml-auto">
                        Live
                      </span>
                    )}
                  </div>
                  <p className="text-white/90 mb-3 leading-relaxed">{transcript.text}</p>
                  {transcript.analysis && transcript.isFinal && (
                    <div className="border-t border-[#803ceb]/20 pt-3 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-2">AI Summary</div>
                          <p className="text-white/70 text-sm leading-relaxed">{transcript.analysis.summary}</p>
                        </div>
                        <div>
                          <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-2">Key Insights</div>
                          <p className="text-white/70 text-sm leading-relaxed">{transcript.analysis.semantics}</p>
                        </div>
                      </div>
                      {transcript.analysis.questions && transcript.analysis.questions.length > 0 && (
                        <div>
                          <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-2">Suggested Follow-ups</div>
                          <div className="space-y-2">
                            {transcript.analysis.questions.map((question, i) => (
                              <div key={i} className="flex items-start gap-2 p-2 bg-[#141244]/20 rounded-lg">
                                <div className="w-5 h-5 rounded-full bg-[#803ceb]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-[#803ceb] text-xs font-bold">{i + 1}</span>
                                </div>
                                <span className="text-white/70 text-sm leading-relaxed">{question}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-white/40 text-sm">
          <p>Powered by Google Meet Media API, Speech API, Gemini AI, and advanced real-time processing</p>
          <p className="mt-1">All audio processing requires participant consent and uses secure transmission</p>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #803ceb #141244;
        }
        
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #141244;
          border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(to bottom, #803ceb, #a855f7);
          border-radius: 3px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(to bottom, #7c3aed, #9333ea);
        }
      `}</style>
    </div>
  );
}
