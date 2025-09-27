/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  meet,
  MeetSidePanelClient,
} from '@googleworkspace/meet-addons/meet.addons';

// --- Interface Definitions ---
interface GeminiAnalysis {
  summary: string;
  semantics: string;
  questions: string[];
  confidence?: number;
  keywords?: string[];
}

interface Transcript {
  speaker: string;
  text: string;
  analysis?: GeminiAnalysis;
  timestamp: number;
  isFinal: boolean;
  messageType?: string;
  segmentLength?: number;
  analysisTimestamp?: number;
}

interface AudioMetrics {
  bytesTransmitted: number;
  packetsLost: number;
  averageLatency: number;
  connectionTime: number;
  bytesReceived?: number;
  lastAckTime?: number;
}

interface MeetingSession {
  sessionId: string;
  meetingId: string;
  startTime: Date;
  participants: string[];
}

interface WebSocketStatus {
  audioConnected: boolean;
  transcriptConnected: boolean;
  lastMessageTime: number;
  reconnectAttempts: number;
}

// Audio capture configuration
const AUDIO_CONFIG = {
  sampleRate: 16000,
  channelCount: 1,
  bufferSize: 4096,
  encoding: 'pcm' as const,
  bitDepth: 16
};

// --- Enhanced Audio Capture Class ---
class RealTimeAudioCapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
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
    connectionTime: 0,
    bytesReceived: 0,
    lastAckTime: 0
  };

  constructor(
    private backendUrl: string,
    private onStatusChange: (status: string) => void,
    private onMetricsUpdate: (metrics: AudioMetrics) => void
  ) { }

  async requestPermissions(): Promise<boolean> {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: AUDIO_CONFIG.sampleRate,
          channelCount: AUDIO_CONFIG.channelCount
        }
      });

      micStream.getTracks().forEach(track => track.stop());

      this.onStatusChange('Audio permissions granted');
      return true;

    } catch (error: any) {
      console.error('[AudioCapture] Permission denied:', error);
      this.onStatusChange(`Permission denied: ${error.name}`);
      return false;
    }
  }

  async startCapture(): Promise<boolean> {
    if (this.isCapturing) {
      console.log('[AudioCapture] Already capturing');
      return true;
    }

    try {
      // Connect to WebSocket first
      if (!await this.connectWebSocket()) {
        return false;
      }

      // Get user media
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: AUDIO_CONFIG.sampleRate,
          channelCount: AUDIO_CONFIG.channelCount
        }
      });

      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: AUDIO_CONFIG.sampleRate
      });

      // Create audio nodes
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.gainNode = this.audioContext.createGain();
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        AUDIO_CONFIG.bufferSize,
        AUDIO_CONFIG.channelCount,
        AUDIO_CONFIG.channelCount
      );

      // Configure analyser
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Set up audio processing chain
      source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.analyser.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      // Set up audio processing handler
      this.scriptProcessor.onaudioprocess = this.handleAudioProcess.bind(this);

      this.isCapturing = true;
      this.metrics.connectionTime = Date.now();
      this.startHeartbeat();
      this.onStatusChange('Audio capture active - streaming to backend');

      console.log('[AudioCapture] Capture started successfully');
      return true;

    } catch (error: any) {
      console.error('[AudioCapture] Failed to start capture:', error);
      this.onStatusChange(`Capture failed: ${error.name}`);
      await this.stopCapture();
      return false;
    }
  }

  private handleAudioProcess(event: AudioProcessingEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const inputBuffer = event.inputBuffer.getChannelData(0);

    // Convert Float32Array to Int16Array for transmission
    const int16Buffer = new Int16Array(inputBuffer.length);
    for (let i = 0; i < inputBuffer.length; i++) {
      const sample = Math.max(-1, Math.min(1, inputBuffer[i]));
      int16Buffer[i] = sample * 0x7FFF;
    }

    // Send binary data to backend
    try {
      this.ws.send(int16Buffer.buffer);
      this.metrics.bytesTransmitted += int16Buffer.buffer.byteLength;
      this.onMetricsUpdate(this.metrics);
    } catch (error) {
      console.error('[AudioCapture] Failed to send audio data:', error);
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
            this.onStatusChange('Audio connection timeout');
            resolve(false);
          }
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(connectTimeout);
          this.reconnectAttempts = 0;
          this.onStatusChange('Audio connection established');
          console.log('[AudioCapture] WebSocket connected');
          resolve(true);
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          console.log(`[AudioCapture] WebSocket closed: ${event.code} - ${event.reason}`);
          this.onStatusChange('Audio connection lost');

          if (this.isCapturing && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnection();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          console.error('[AudioCapture] WebSocket error:', error);
          this.onStatusChange('Audio connection error');
          resolve(false);
        };

        this.ws.onmessage = this.handleWebSocketMessage.bind(this);

      } catch (error) {
        console.error('[AudioCapture] WebSocket creation failed:', error);
        this.onStatusChange('Failed to create audio connection');
        resolve(false);
      }
    });
  }

  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);

        if (data.type === 'audio_ack') {
          this.metrics.bytesReceived = (this.metrics.bytesReceived || 0) + (data.bytes_received || 0);
          this.metrics.lastAckTime = data.timestamp;
          this.metrics.averageLatency = Date.now() - data.timestamp;
          this.onMetricsUpdate(this.metrics);
        } else if (data.type === 'pong') {
          const latency = Date.now() - data.timestamp;
          this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
        }
      }
    } catch (error) {
      console.debug('[AudioCapture] Non-JSON message received:', event.data);
    }
  }

  private attemptReconnection(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.onStatusChange(`Reconnecting audio... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      if (this.isCapturing) {
        const connected = await this.connectWebSocket();
        if (!connected && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnection();
        } else if (!connected) {
          this.onStatusChange('Max audio reconnection attempts reached');
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

    // Clean up audio nodes
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (error) {
        console.warn('[AudioCapture] Error closing audio context:', error);
      }
      this.audioContext = null;
    }

    // Clean up media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }

    this.onStatusChange('Audio capture stopped');
    console.log('[AudioCapture] Capture stopped');
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

// --- Enhanced UI Components ---
const AIOrb = ({ isActive, size = "w-4 h-4" }: { isActive: boolean; size?: string }) => (
  <div className={`${size} rounded-full bg-gradient-to-r from-[#803ceb] to-[#a855f7] ${isActive ? 'animate-pulse shadow-lg shadow-purple-400/50' : 'opacity-50'
    } transition-all duration-300`}>
    <div className="w-full h-full rounded-full bg-gradient-to-r from-[#803ceb] to-[#a855f7] animate-spin opacity-75"></div>
  </div>
);

const StatusIndicator = ({ status, isConnected, wsStatus }: {
  status: string;
  isConnected: boolean;
  wsStatus: WebSocketStatus;
}) => (
  <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-[#141244]/40 to-[#803ceb]/20 backdrop-blur-sm border border-[#803ceb]/30">
    <div className="flex items-center gap-2">
      <AIOrb isActive={isConnected && wsStatus.audioConnected} size="w-3 h-3" />
      <AIOrb isActive={isConnected && wsStatus.transcriptConnected} size="w-3 h-3" />
    </div>
    <div className="flex-1">
      <div className="text-xs text-[#803ceb] font-medium uppercase tracking-wide">System Status</div>
      <div className="text-white/90 text-sm">{status}</div>
      <div className="text-xs text-white/60 mt-1">
        Audio: {wsStatus.audioConnected ? '🟢' : '🔴'} |
        Transcript: {wsStatus.transcriptConnected ? '🟢' : '🔴'} |
        Attempts: {wsStatus.reconnectAttempts}
      </div>
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
    size?: 'sm' | 'md' | 'lg';
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

// --- Enhanced Transcript Components ---
const TranscriptEntry = ({ transcript }: { transcript: Transcript }) => {
  const isFinal = transcript.isFinal;
  const isAnalyzed = !!transcript.analysis;
  const isInterim = transcript.messageType === 'interim_transcript';
  const isError = transcript.messageType === 'analysis_error';

  return (
    <div className={`p-3 rounded-lg mb-3 ${isError ? 'bg-red-500/10 border-l-4 border-l-red-500' :
        isInterim ? 'bg-transparent border-l-2 border-l-yellow-500/40 animate-pulse-slow' :
          isFinal ? 'bg-[#1a1458]/70 border-l-4 border-l-emerald-500/80' :
            'bg-transparent border-l-2 border-l-[#803ceb]/40'
      }`}>
      <div className={`font-semibold text-sm ${isError ? 'text-red-400' :
          isInterim ? 'text-yellow-400' :
            isFinal ? 'text-emerald-400' : 'text-[#803ceb]'
        } mb-1`}>
        {transcript.speaker}
        <span className="text-xs text-white/50 ml-2">
          ({new Date(transcript.timestamp).toLocaleTimeString()})
          {transcript.segmentLength && ` • ${transcript.segmentLength} chars`}
        </span>
      </div>
      <p className={`text-white/90 ${isInterim ? 'italic text-white/70' : ''}`}>
        {transcript.text}
        {isFinal && isAnalyzed && ' ✨ (Analyzed)'}
        {isError && ' ❌ (Analysis Failed)'}
        {isInterim && ' ⏳ (Listening...)'}
      </p>

      {/* Fix: Only render AnalysisDisplay if analysis exists */}
      {transcript.analysis && (
        <AnalysisDisplay analysis={transcript.analysis} />
      )}
    </div>
  );
};

const AnalysisDisplay = ({ analysis }: { analysis: GeminiAnalysis }) => (
  <div className="mt-3 p-3 rounded-md bg-[#803ceb]/20 border border-[#803ceb]/40 text-sm">
    <div className="flex items-center justify-between mb-2">
      <h4 className="font-bold text-[#a855f7]">AI Insight</h4>
      {analysis.confidence && (
        <span className="text-xs bg-white/10 px-2 py-1 rounded-full">
          Confidence: {(analysis.confidence * 100).toFixed(0)}%
        </span>
      )}
    </div>
    <p className="text-white/90 mb-2">
      <span className="font-semibold text-white">Summary:</span> {analysis.summary}
    </p>
    <p className="text-white/90 mb-2">
      <span className="font-semibold text-white">Semantics:</span> {analysis.semantics}
    </p>
    {analysis.keywords && analysis.keywords.length > 0 && (
      <div className="mb-2">
        <span className="font-semibold text-white">Keywords:</span>
        <div className="flex flex-wrap gap-1 mt-1">
          {analysis.keywords.map((keyword, index) => (
            <span key={index} className="bg-[#803ceb]/30 px-2 py-1 rounded-full text-xs">
              {keyword}
            </span>
          ))}
        </div>
      </div>
    )}
    {analysis.questions && analysis.questions.length > 0 && (
      <div>
        <span className="font-semibold text-white">Suggested Questions:</span>
        <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
          {analysis.questions.map((q, index) => (
            <li key={index} className="text-white/80">{q}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

// --- Main Component ---
export default function SidePanel() {
  const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [status, setStatus] = useState('Initializing Recos AI...');
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [meetingSession, setMeetingSession] = useState<MeetingSession | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
    bytesTransmitted: 0,
    packetsLost: 0,
    averageLatency: 0,
    connectionTime: 0,
    bytesReceived: 0,
    lastAckTime: 0
  });
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>({
    audioConnected: false,
    transcriptConnected: false,
    lastMessageTime: 0,
    reconnectAttempts: 0
  });

  const audioCapture = useRef<RealTimeAudioCapture | null>(null);
  const transcriptWebSocket = useRef<WebSocket | null>(null);
  const audioLevelInterval = useRef<NodeJS.Timeout | null>(null);
  const transcriptsEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://add-on-backend.onrender.com';

  // Scroll transcripts to bottom on new entry
  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Initialize Meet Add-on
  useEffect(() => {
    const initializeAddon = async () => {
      try {
        const session = await meet.addon.createAddonSession({
          cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
        });
        const client = await session.createSidePanelClient();
        setSidePanelClient(client);

        const meetingInfo = await client.getMeetingInfo();
        setMeetingSession({
          sessionId: `session_${Date.now()}`,
          meetingId: meetingInfo.meetingId || 'unknown',
          startTime: new Date(),
          participants: []
        });

        setStatus('Recos AI initialized successfully');

        client.on('frameToFrameMessage', (event) => {
          console.log('Frame to frame message:', event);
        });

      } catch (error) {
        console.error('Error initializing addon:', error);
        setStatus('Failed to initialize Recos AI');
      }
    };

    initializeAddon();
  }, []);

  // Initialize Audio Capture
  useEffect(() => {
    audioCapture.current = new RealTimeAudioCapture(
      backendUrl,
      setStatus,
      setAudioMetrics
    );

    return () => {
      if (audioCapture.current) {
        audioCapture.current.stopCapture();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [backendUrl]);

  // Audio level monitoring
  useEffect(() => {
    if (isCapturing) {
      audioLevelInterval.current = setInterval(() => {
        if (audioCapture.current) {
          setAudioLevel(audioCapture.current.getAudioLevel());
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

  // Enhanced WebSocket connection for transcripts
  const connectToTranscriptStream = useCallback(() => {
    if (transcriptWebSocket.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/transcripts';
    transcriptWebSocket.current = new WebSocket(wsUrl);

    transcriptWebSocket.current.onopen = () => {
      console.log('[TranscriptWS] Connected to transcript stream');
      setWsStatus(prev => ({
        ...prev,
        transcriptConnected: true,
        reconnectAttempts: 0
      }));
      setStatus(prev => prev.includes('transcript') ? 'All connections established' : prev);
    };

    transcriptWebSocket.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setWsStatus(prev => ({ ...prev, lastMessageTime: Date.now() }));

        if (data.type === 'connection_established') {
          console.log('[TranscriptWS] Connection established');
          return;
        }

        // Handle different message types
        const newTranscript: Transcript = {
          speaker: data.speaker_name || 'Unknown Speaker',
          text: data.transcript,
          analysis: data.analysis,
          timestamp: data.timestamp || Date.now(),
          isFinal: data.is_final || false,
          messageType: data.message_type,
          segmentLength: data.segment_length,
          analysisTimestamp: data.analysis_timestamp
        };

        setTranscripts((prev) => {
          // For interim transcripts, replace the previous interim from the same speaker
          if (data.message_type === 'interim_transcript') {
            const otherTranscripts = prev.filter(t =>
              !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
            );
            return [newTranscript, ...otherTranscripts];
          }

          // For final transcripts, remove any interim from the same speaker and add the final one
          if (data.message_type === 'final_transcript') {
            const otherTranscripts = prev.filter(t =>
              !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
            );
            return [newTranscript, ...otherTranscripts];
          }

          // For enriched transcripts or errors, just add them
          return [newTranscript, ...prev];
        });

      } catch (error) {
        console.error('Error processing transcript message:', error);
      }
    };

    transcriptWebSocket.current.onclose = (event) => {
      console.log('[TranscriptWS] Connection closed:', event.code, event.reason);
      setWsStatus(prev => ({ ...prev, transcriptConnected: false }));

      if (isCapturing) {
        setWsStatus(prev => ({
          ...prev,
          reconnectAttempts: prev.reconnectAttempts + 1
        }));

        reconnectTimeout.current = setTimeout(() => {
          if (isCapturing) {
            console.log('[TranscriptWS] Attempting to reconnect...');
            connectToTranscriptStream();
          }
        }, 5000);
      }
    };

    transcriptWebSocket.current.onerror = (error) => {
      console.error('[TranscriptWS] Error:', error);
      setWsStatus(prev => ({ ...prev, transcriptConnected: false }));
    };

  }, [backendUrl, isCapturing]);

  // Update status based on WebSocket connections
  useEffect(() => {
    if (isCapturing) {
      if (wsStatus.audioConnected && wsStatus.transcriptConnected) {
        setStatus('All systems connected - AI analysis active');
      } else if (wsStatus.audioConnected && !wsStatus.transcriptConnected) {
        setStatus('Audio connected - waiting for transcript stream...');
      } else if (!wsStatus.audioConnected && wsStatus.transcriptConnected) {
        setStatus('Transcript connected - waiting for audio stream...');
      } else {
        setStatus('Connecting to backend services...');
      }
    }
  }, [wsStatus.audioConnected, wsStatus.transcriptConnected, isCapturing]);

  const requestPermissions = async () => {
    setLoading(true);
    try {
      if (audioCapture.current) {
        const granted = await audioCapture.current.requestPermissions();
        setHasPermissions(granted);
        if (granted) {
          setStatus('Permissions granted - Ready to start analysis');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const startCapture = async () => {
    setLoading(true);
    try {
      if (audioCapture.current && await audioCapture.current.startCapture()) {
        setIsCapturing(true);
        setWsStatus(prev => ({ ...prev, audioConnected: true }));
        connectToTranscriptStream();

        // Start meeting session on backend
        if (meetingSession) {
          try {
            await fetch(`${backendUrl}/api/session/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                meetingId: meetingSession.meetingId,
                participants: meetingSession.participants
              })
            });
          } catch (error) {
            console.error('Failed to start session on backend:', error);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const stopCapture = async () => {
    setLoading(true);
    try {
      if (audioCapture.current) {
        await audioCapture.current.stopCapture();
        setIsCapturing(false);
        setWsStatus({
          audioConnected: false,
          transcriptConnected: false,
          lastMessageTime: 0,
          reconnectAttempts: 0
        });

        if (transcriptWebSocket.current) {
          transcriptWebSocket.current.close();
          transcriptWebSocket.current = null;
        }

        if (reconnectTimeout.current) {
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }

        // End meeting session on backend
        if (meetingSession) {
          try {
            await fetch(`${backendUrl}/api/session/end`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ meetingId: meetingSession.meetingId })
            });
          } catch (error) {
            console.error('Failed to end session on backend:', error);
          }
        }

        setStatus('Analysis stopped - Ready to start again');
      }
    } finally {
      setLoading(false);
    }
  };

  const startActivity = async () => {
    if (!sidePanelClient) return;
    try {
      await sidePanelClient.startActivity({});
      setStatus('Shared activity started');
    } catch (error) {
      console.error('Error starting activity:', error);
      setStatus('Failed to start shared activity');
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

  const clearTranscripts = () => {
    setTranscripts([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141244] to-[#1a1458] text-white p-6">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#803ceb]/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#803ceb]/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#a855f7]/10 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <AIOrb isActive={hasPermissions} size="w-8 h-8" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-[#803ceb] bg-clip-text text-transparent">
              Recos AI
            </h1>
            <AIOrb isActive={isCapturing} size="w-8 h-8" />
          </div>
          <p className="text-white/60 text-lg">Real-time meeting intelligence & analysis</p>
        </div>

        {/* Status Dashboard */}
        <div className="mb-8">
          <StatusIndicator status={status} isConnected={isCapturing} wsStatus={wsStatus} />
        </div>

        {/* System Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Audio Level</div>
            <AudioLevelMeter level={audioLevel} />
            <span className="text-white/90 text-sm">{Math.round(audioLevel * 100)}%</span>
          </div>

          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Data Flow</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={audioMetrics.bytesTransmitted > 0} size="w-2 h-2" />
              <span className="text-white/90 text-sm">
                ↑{formatBytes(audioMetrics.bytesTransmitted)}<br />
                ↓{formatBytes(audioMetrics.bytesReceived || 0)}
              </span>
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
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Session</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={isCapturing} size="w-2 h-2" />
              <span className="text-white/90 text-sm">
                {isCapturing ? formatDuration(audioMetrics.connectionTime) : '0:00'}<br />
                {transcripts.length} transcripts
              </span>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card title="Audio Capture Control" glowing={isCapturing}>
            <div className="space-y-4">
              {!hasPermissions ? (
                <div className="space-y-3">
                  <p className="text-white/70 text-sm">
                    Audio permissions required to capture meeting audio for transcription.
                  </p>
                  <Button onClick={requestPermissions} disabled={loading} loading={loading}>
                    Grant Microphone Permission
                  </Button>
                </div>
              ) : !isCapturing ? (
                <Button onClick={startCapture} disabled={loading || !hasPermissions} loading={loading} variant="success">
                  Start Real-time AI Analysis
                </Button>
              ) : (
                <div className="space-y-3">
                  <Button onClick={stopCapture} disabled={loading} loading={loading} variant="danger">
                    Stop AI Analysis
                  </Button>
                  <Button onClick={clearTranscripts} variant="secondary" className="w-full">
                    Clear Transcripts
                  </Button>
                </div>
              )}
              {hasPermissions && !isCapturing && (
                <p className="text-white/50 text-xs mt-2">
                  Click &apos;Start&apos; to begin streaming audio to the backend for AI processing.
                </p>
              )}
            </div>
          </Card>

          <Card title="Meeting Actions" glowing={!!sidePanelClient}>
            <div className="space-y-4">
              <Button onClick={startActivity} disabled={!sidePanelClient || isCapturing} variant="secondary" className="w-full">
                Start Shared Activity (Co-watch)
              </Button>
              <Button onClick={getMeetingInfo} disabled={!sidePanelClient} variant="secondary" className="w-full">
                Get Latest Meeting Info
              </Button>
              <p className="text-white/50 text-xs mt-2">
                Shared activities allow all participants to co-watch an experience.
              </p>
            </div>
          </Card>
        </div>

        {/* Transcripts and Analysis Stream */}
        <Card title="Real-time Transcripts & Insights" glowing={isCapturing}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-white/60">
              {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} •
              Last update: {wsStatus.lastMessageTime ? new Date(wsStatus.lastMessageTime).toLocaleTimeString() : 'Never'}
            </div>
            {transcripts.length > 0 && (
              <Button onClick={clearTranscripts} variant="secondary" size="sm">
                Clear All
              </Button>
            )}
          </div>

          <div className="h-96 overflow-y-auto space-y-4 p-2 pr-4 custom-scrollbar">
            {transcripts.length === 0 && (
              <div className="text-center p-10 text-white/50">
                {isCapturing ? (
                  <>
                    <p className="mb-2">Listening for audio...</p>
                    <p className="text-sm">Transcripts will appear here as participants speak.</p>
                    {!wsStatus.transcriptConnected && (
                      <p className="text-sm text-yellow-400 mt-2">Connecting to transcript service...</p>
                    )}
                  </>
                ) : (
                  <p>Start the AI Analysis to see real-time transcripts and Gemini insights.</p>
                )}
              </div>
            )}

            <div className="space-y-4">
              {transcripts.map((transcript, index) => (
                <TranscriptEntry key={`${transcript.timestamp}-${index}`} transcript={transcript} />
              ))}
            </div>

            <div ref={transcriptsEndRef} />
          </div>
        </Card>

      </div>

      {/* Custom Scrollbar Styling */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: #1a1458;
            border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #803ceb;
            border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #a855f7;
        }
        @keyframes pulse-slow {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        .animate-pulse-slow {
            animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}

// Add the missing Button size prop
// declare module './sidepanel' {
  
// }