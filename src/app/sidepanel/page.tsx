/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { BACKEND_URL } from '../utils/constants';
import { AIOrb } from '../components/AIOrb';
import { StatusIndicator } from '../components/StatusIndicator';
import { formatBytes, formatDuration } from '../utils/formatters';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TranscriptEntry } from '../components/TranscriptEntry';
import { MeetingSession, Transcript } from '../types';
import { useTranscriptStream } from '../hooks/useTranscriptStream';
import { meet } from '@googleworkspace/meet-addons/meet.addons';

export default function SidePanel() {
  const [addonSession, setAddonSession] = useState<any>(null);
  const [sidePanelClient, setSidePanelClient] = useState<any>();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [meetingSession, setMeetingSession] = useState<MeetingSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('Initializing...');
  const [botStatus, setBotStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);

  const transcriptsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeAddon = async () => {
      try {
        const session = await meet.addon.createAddonSession({
          cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
        });
        setAddonSession(session);

        const client = await session.createSidePanelClient();
        setSidePanelClient(client);

        setStatus('Ready to connect');
        console.log('Add-on session initialized successfully');
      } catch (error) {
        console.error('Failed to initialize add-on session:', error);
        setStatus('Failed to initialize add-on');
      }
    };

    initializeAddon();
  }, []);

  const handleTranscriptReceived = useCallback((data: any) => {
    const newTranscript: Transcript = {
      speaker: data.speaker_name || 'Unknown Speaker',
      text: data.transcript,
      analysis: data.analysis,
      timestamp: data.timestamp || Date.now(),
      isFinal: data.is_final || false,
      messageType: data.message_type,
      segmentLength: data.transcript?.length,
      analysisTimestamp: data.analysis_timestamp
    };

    setTranscripts((prev) => {
      if (data.message_type === 'interim_transcript') {
        const otherTranscripts = prev.filter(t =>
          !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
        );
        return [newTranscript, ...otherTranscripts];
      }

      if (data.message_type === 'final_transcript' || data.message_type === 'enriched_transcript') {
        const otherTranscripts = prev.filter(t =>
          !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
        );
        return [newTranscript, ...otherTranscripts];
      }

      return [newTranscript, ...prev];
    });
  }, []);

  const {
    isConnected,
    connectionStatus,
    lastMessageTime,
    reconnectAttempts,
    bytesReceived,
    connect,
    disconnect,
  } = useTranscriptStream(handleTranscriptReceived);

  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const testBackendConnection = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Backend health check:', data);
        return true;
      } else {
        console.error('Backend health check failed:', response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.error('Backend connection test failed:', error);
      return false;
    }
  };

  const handleStartBot = async (): Promise<void> => {
    setLoading(true);
    setBotStatus('starting');

    try {
      const backendConnected = await testBackendConnection();
      if (!backendConnected) {
        setStatus('Backend server not reachable');
        setBotStatus('error');
        return;
      }

      let meetingLink = '';
      if (sidePanelClient) {
        try {
          const meetingInfo = await sidePanelClient.getMeetingInfo();
          meetingLink = meetingInfo.meetingCode
            ? `https://meet.google.com/${meetingInfo.meetingCode}`
            : '';
          console.log('Meeting link:', meetingLink);
        } catch (error) {
          console.error('Failed to get meeting info:', error);
        }
      }

      const response = await fetch(`${BACKEND_URL}/api/bot/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetLink: meetingLink || process.env.NEXT_PUBLIC_DEFAULT_MEET_LINK,
          duration: 60
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start bot');
      }

      const data = await response.json();
      console.log('Bot started:', data);

      connect();
      setBotStatus('running');
      setSessionStartTime(Date.now());
      setStatus('Bot is joining the meeting...');

      if (meetingSession) {
        try {
          await fetch(`${BACKEND_URL}/api/session/start`, {
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
    } catch (error) {
      console.error('Failed to start bot:', error);
      setStatus('Failed to start bot');
      setBotStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleStopBot = async (): Promise<void> => {
    setLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/bot/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to stop bot');
      }

      disconnect();
      setBotStatus('idle');
      setSessionStartTime(0);
      setStatus('Bot stopped');

      if (meetingSession) {
        try {
          await fetch(`${BACKEND_URL}/api/session/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ meetingId: meetingSession.meetingId })
          });
        } catch (error) {
          console.error('Failed to end session on backend:', error);
        }
      }
    } catch (error) {
      console.error('Failed to stop bot:', error);
      setStatus('Failed to stop bot');
    } finally {
      setLoading(false);
    }
  };

  const clearTranscripts = (): void => {
    setTranscripts([]);
  };

  const openMainStage = async (): Promise<void> => {
    if (!sidePanelClient) {
      setStatus('Add-on not initialized');
      return;
    }

    try {
      setLoading(true);
      const mainStageUrl = `${window.location.origin}/mainstage`;
      await sidePanelClient.startActivity({
        mainStageUrl: mainStageUrl,
        activityStartingState: {
          additionalData: JSON.stringify({ timestamp: Date.now() })
        }
      });
      setStatus('Main stage opened for all participants');
      console.log('Main stage opened successfully');
    } catch (error) {
      console.error('Error opening main stage:', error);
      setStatus('Failed to open main stage');
    } finally {
      setLoading(false);
    }
  };

  const getMeetingInfo = async (): Promise<void> => {
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

  const sessionDuration = sessionStartTime > 0
    ? Math.floor((Date.now() - sessionStartTime) / 1000)
    : 0;

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
            <AIOrb isActive={isConnected} size="w-8 h-8" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-[#803ceb] bg-clip-text text-transparent">
              Recos AI
            </h1>
            <AIOrb isActive={botStatus === 'running'} size="w-8 h-8" />
          </div>
          <p className="text-white/60 text-lg">Real-time meeting intelligence & analysis</p>
        </div>

        {/* Status Dashboard */}
        <div className="mb-8">
          <StatusIndicator
            status={status}
            isConnected={botStatus === 'running'}
            wsStatus={{
              audioConnected: botStatus === 'running',
              transcriptConnected: isConnected,
              lastMessageTime,
              reconnectAttempts
            }}
          />
        </div>

        {/* System Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Bot Status</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={botStatus === 'running'} size="w-2 h-2" />
              <span className="text-white/90 text-sm capitalize">{botStatus}</span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Data Received</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={bytesReceived > 0} size="w-2 h-2" />
              <span className="text-white/90 text-sm">
                ↓{formatBytes(bytesReceived)}
              </span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Connection</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={isConnected} size="w-2 h-2" />
              <span className="text-white/90 text-sm text-ellipsis overflow-hidden">
                {connectionStatus}
              </span>
            </div>
          </div>

          <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
            <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Session</div>
            <div className="flex items-center gap-2">
              <AIOrb isActive={botStatus === 'running'} size="w-2 h-2" />
              <span className="text-white/90 text-sm">
                {botStatus === 'running' ? formatDuration(sessionDuration) : '0:00'}<br />
                {transcripts.length} transcripts
              </span>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card title="Bot Control" glowing={botStatus === 'running'}>
            <div className="space-y-4">
              {botStatus === 'idle' || botStatus === 'error' ? (
                <div className="space-y-3">
                  <p className="text-white/70 text-sm">
                    Start the bot to join this meeting and capture audio for AI-powered transcription and analysis.
                  </p>
                  <Button
                    onClick={handleStartBot}
                    disabled={loading || !addonSession}
                    loading={loading}
                    variant="success"
                  >
                    Start Bot & AI Analysis
                  </Button>
                  {botStatus === 'error' && (
                    <p className="text-red-400 text-xs">
                      Failed to start bot. Check backend connection.
                    </p>
                  )}
                </div>
              ) : botStatus === 'starting' ? (
                <div className="text-center py-4">
                  <AIOrb isActive={true} size="w-12 h-12 mx-auto mb-2" />
                  <p className="text-white/70 text-sm">Bot is starting and joining the meeting...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-3">
                    <p className="text-green-400 text-sm flex items-center gap-2">
                      <AIOrb isActive={true} size="w-3 h-3" />
                      Bot is active and capturing audio
                    </p>
                  </div>
                  <Button
                    onClick={handleStopBot}
                    disabled={loading}
                    loading={loading}
                    variant="danger"
                  >
                    Stop Bot & Analysis
                  </Button>
                  <Button onClick={clearTranscripts} variant="secondary" className="w-full">
                    Clear Transcripts
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card title="Meeting Actions" glowing={!!sidePanelClient}>
            <div className="space-y-4">
              <Button
                onClick={openMainStage}
                disabled={!sidePanelClient || loading}
                variant="success"
                className="w-full"
              >
                Open Main Stage
              </Button>
              <Button
                onClick={getMeetingInfo}
                disabled={!sidePanelClient}
                variant="secondary"
                className="w-full"
              >
                Get Meeting Info
              </Button>
              <p className="text-white/50 text-xs mt-2">
                Main stage displays transcripts to all participants in the meeting.
              </p>
            </div>
          </Card>
        </div>

        {/* Transcripts and Analysis Stream */}
        <Card title="Real-time Transcripts & Insights" glowing={botStatus === 'running'}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-white/60">
              {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} •
              Last update: {lastMessageTime ? new Date(lastMessageTime).toLocaleTimeString() : 'Never'}
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
                {botStatus === 'running' ? (
                  <>
                    <AIOrb isActive={true} size="w-16 h-16 mx-auto mb-4" />
                    <p className="mb-2">Bot is listening for audio...</p>
                    <p className="text-sm">Transcripts will appear here as participants speak.</p>
                    {!isConnected && (
                      <p className="text-sm text-yellow-400 mt-2">
                        {connectionStatus}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mb-2">Start the bot to begin capturing transcripts</p>
                    <p className="text-sm">Real-time transcripts and Gemini AI insights will appear here.</p>
                  </>
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
    </div>
  );
}