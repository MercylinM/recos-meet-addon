/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  meet,
  MeetSidePanelClient,
} from '@googleworkspace/meet-addons/meet.addons';
import { MeetingSession, Transcript, WebSocketStatus } from './types';
import { AIOrb } from './components/AIOrb';
import { StatusIndicator } from './components/StatusIndicator';
import { Card } from './components/Card';
import { Button } from './components/Button';
import { useAudioCapture } from './hooks/useAudioCapture';


export default function SidePanel() {
  const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
  const [status, setStatus] = useState('Initializing Recos AI...');
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [meetingSession, setMeetingSession] = useState<MeetingSession | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
      isCapturing,
    } = useAudioCapture();

  const [wsStatus, setWsStatus] = useState<WebSocketStatus>({
      audioConnected: false,
      transcriptConnected: false,
      lastMessageTime: 0,
      reconnectAttempts: 0
    });

  const transcriptWebSocket = useRef<WebSocket | null>(null);
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://add-on-backend.onrender.com';

  const connectToTranscriptStream = useCallback(() => {
    if (transcriptWebSocket.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/transcripts';
    console.log('🔄 Connecting to bot transcript WebSocket:', wsUrl);

    transcriptWebSocket.current = new WebSocket(wsUrl);

    transcriptWebSocket.current.onopen = () => {
      console.log('✅ Connected to bot transcript WebSocket');
      setIsConnected(true);
      setStatus('Connected to bot backend - Waiting for transcripts');
    };

    transcriptWebSocket.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 Received from bot:', data);

        const messageType = data.message_type;

        if (messageType === 'interim_transcript') {
          const interimTranscript: Transcript = {
            speaker: data.speaker_name || 'Speaker',
            text: data.transcript,
            timestamp: data.timestamp || Date.now(),
            isFinal: false,
          };

          setTranscripts((prev) => {
            const existingInterimIndex = prev.findIndex(t => !t.isFinal);
            if (existingInterimIndex >= 0) {
              const updated = [...prev];
              updated[existingInterimIndex] = interimTranscript;
              return updated;
            }
            return [interimTranscript, ...prev];
          });

        } else if (messageType === 'final_transcript') {
          const finalTranscript: Transcript = {
            speaker: data.speaker_name || 'Unknown Speaker',
            text: data.transcript,
            timestamp: data.timestamp || Date.now(),
            isFinal: true,
          };

          setTranscripts((prev) => {
            const filtered = prev.filter(t => t.isFinal);
            return [finalTranscript, ...filtered];
          });

          setStatus('Bot is transcribing meeting...');

        } else if (messageType === 'enriched_transcript') {
          const enrichedTranscript: Transcript = {
            speaker: data.speaker_name || 'Unknown Speaker',
            text: data.transcript,
            analysis: data.analysis ? {
              summary: data.analysis.summary || '',
              semantics: data.analysis.semantics || '',
              questions: data.analysis.questions || []
            } : undefined,
            timestamp: data.timestamp || Date.now(),
            isFinal: true,
          };

          setTranscripts((prev) => {
            const filtered = prev.filter(t =>
              !(t.isFinal && t.speaker === enrichedTranscript.speaker &&
                Math.abs(t.timestamp - enrichedTranscript.timestamp) < 5000)
            );
            return [enrichedTranscript, ...filtered];
          });

          setStatus('AI analysis received from bot');

        } else if (messageType === 'bot_status') {
          setStatus(`Bot: ${data.status || 'Processing audio'}`);

        } else if (messageType === 'analysis_error') {
          console.warn('Bot analysis error:', data.error);
          setStatus('Bot analysis error - transcription continues');

        } else {
          console.log('Unknown bot message:', messageType, data);
        }

      } catch (error) {
        console.error('Error processing bot message:', error);
      }
    };

    transcriptWebSocket.current.onclose = (event) => {
      console.log('🔌 Bot WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
      setStatus('Bot connection lost - Reconnecting...');

      // Auto-reconnect
      setTimeout(connectToTranscriptStream, 5000);
    };

    transcriptWebSocket.current.onerror = (error) => {
      console.error('Bot WebSocket error:', error);
      setIsConnected(false);
      setStatus('Cannot connect to bot - Make sure bot is running');
    };

  }, [backendUrl]);

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
          startTime: new Date().toISOString(),
          participants: []
        });

        setStatus('Recos AI initialized - Connect to bot backend');

        connectToTranscriptStream();

      } catch (error) {
        console.error('Error initializing addon:', error);
        setStatus('Failed to initialize Recos AI');
      }
    };

    initializeAddon();
  }, [backendUrl, connectToTranscriptStream]);

  

  const startBotSession = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${backendUrl}/api/session/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId: meetingSession?.meetingId || 'unknown',
          meetingLink: window.location.href,
          startTime: new Date().toLocaleTimeString()
        })
      });

      if (response.ok) {
        setStatus('Bot session started - Waiting for audio capture...');
      } else {
        setStatus('Failed to start bot session');
      }
    } catch (error) {
      console.error('Error starting bot session:', error);
      setStatus('Cannot reach bot backend');
    } finally {
      setLoading(false);
    }
  };

  const stopBotSession = async () => {
    setLoading(true);
    try {
      await fetch(`${backendUrl}/api/session/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meetingId: meetingSession?.meetingId || 'unknown'
        })
      });
      setStatus('Bot session ended');
    } catch (error) {
      console.error('Error stopping bot session:', error);
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

  useEffect(() => {
    return () => {
      if (transcriptWebSocket.current) {
        transcriptWebSocket.current.close();
      }
    };
  }, []);

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
            <AIOrb isActive={isConnected} size="w-8 h-8" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-[#803ceb] bg-clip-text text-transparent">
              Recos AI
            </h1>
            <AIOrb isActive={transcripts.length > 0} size="w-8 h-8" />
          </div>
          <p className="text-white/60 text-lg">Real-time meeting intelligence powered by bot</p>
        </div>

        {/* Status Dashboard */}
        <div className="mb-8">
          <StatusIndicator status={status} isConnected={isCapturing} wsStatus={wsStatus} />
        </div>

        {/* Connection Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Bot Connection</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={isConnected} size="w-2 h-2" />
              <span className="text-white/90 text-sm">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Transcripts</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={transcripts.length > 0} size="w-2 h-2" />
              <span className="text-white/90 text-sm">{transcripts.length} received</span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">AI Analysis</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={transcripts.some(t => t.analysis)} size="w-2 h-2" />
              <span className="text-white/90 text-sm">
                {transcripts.filter(t => t.analysis).length} analyzed
              </span>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card title="Bot Controls" glowing={isConnected}>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={startBotSession}
                  loading={loading}
                  variant="success"
                  disabled={isConnected}
                >
                  Start Bot Session
                </Button>
                <Button
                  onClick={stopBotSession}
                  loading={loading}
                  variant="danger"
                  disabled={!isConnected}
                >
                  Stop Bot Session
                </Button>
                <Button
                  onClick={connectToTranscriptStream}
                  variant="secondary"
                >
                  Reconnect
                </Button>
              </div>
            </div>
          </Card>

          <Card title="Meeting Info" glowing={!!meetingSession}>
            <div className="space-y-4">
              {meetingSession && (
                <div className="bg-[#141244]/40 rounded-lg p-3 mb-4">
                  <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Session Info</div>
                  <div className="text-white/70 text-sm space-y-1">
                    <div>Meeting: {meetingSession.meetingId}</div>
                    <div>Started: {meetingSession.startTime}</div>
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
                <AIOrb isActive={isConnected} size="w-12 h-12" />
                <p className="mt-4 text-center">
                  {isConnected
                    ? "Bot is processing audio... Transcripts will appear here soon."
                    : "Connect to bot backend to see real-time transcripts and AI analysis."
                  }
                </p>
                {isConnected && (
                  <div className="mt-2 text-xs text-white/40">
                    Audio is being captured and processed by the external bot
                  </div>
                )}
              </div>
            ) : (
              transcripts.map((transcript, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-xl border transition-all duration-500 ${transcript.isFinal
                      ? transcript.analysis
                        ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/5 border-green-500/30'
                        : 'bg-gradient-to-r from-blue-500/10 to-blue-500/5 border-blue-500/30'
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
                      <span className="text-xs text-[#803ceb] bg-[#803ceb]/20 px-2 py-1 rounded-full">
                        Live
                      </span>
                    )}
                    {transcript.analysis && (
                      <span className="text-xs text-green-400 bg-green-400/20 px-2 py-1 rounded-full ml-auto">
                        🤖 AI Analyzed
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
      </div>

    </div>
  );
}
