/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { BACKEND_URL } from '../utils/constants';
import { AIOrb } from '../components/AIOrb';
import { StatusIndicator } from '../components/StatusIndicator';
import { formatBytes, formatDuration } from '../utils/formatters';
import { Card } from '../components/Card';
import { TranscriptEntry } from '../components/TranscriptEntry';
import { MeetingSession, Transcript } from '../types';
import { useTranscriptStream } from '../hooks/useTranscriptStream';
import { meet } from '@googleworkspace/meet-addons/meet.addons';
import { Button } from '../components/Button';

export default function SidePanel() {
  const [addonSession, setAddonSession] = useState<any>(null);
  const [sidePanelClient, setSidePanelClient] = useState<any>();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [meetingSession, setMeetingSession] = useState<MeetingSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('Initializing...');
  const [botStatus, setBotStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [meetingInfo, setMeetingInfo] = useState<any>(null);

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

        try {
          const info = await client.getMeetingInfo();
          setMeetingInfo(info);
          console.log('Meeting info:', info);
          setStatus(`Connected to meeting: ${info.meetingCode || 'Unknown'}`);
        } catch (error) {
          console.error('Failed to get meeting info:', error);
          setStatus('Connected to meeting');
        }

        console.log('Add-on session initialized successfully');
      } catch (error) {
        console.error('Failed to initialize add-on session:', error);
        setStatus('Failed to initialize add-on');
      }
    };

    initializeAddon();
  }, []);

  const handleTranscriptReceived = useCallback((data: any) => {
    console.log('📥 Received WebSocket message:', data);

    // Handle analysis messages (Gemini insights)
    if (data.type === 'analysis') {
      console.log('Processing analysis data:', data);

      const analysisTranscript: Transcript = {
        speaker: data.speaker || 'AI Analysis',
        text: data.candidate_answer || data.transcript || '',
        analysis: {
          summary: data.analysis?.candidate_answer_summary,
          semantics: data.analysis?.semantics,
          questions: data.analysis?.questions || [],
          confidence: data.analysis?.confidence || 0,
          keywords: data.analysis?.keywords || [],
          answer_quality: data.analysis?.answer_quality,
          detected_question: data.analysis?.detected_question
        },
        timestamp: data.timestamp || Date.now(),
        isFinal: true,
        messageType: 'analysis',
        segmentLength: data.candidate_answer?.length || 0,
        analysisTimestamp: Date.now(),
        question: data.question,
        interview_id: data.interview_id
      };

      setTranscripts((prev) => [...prev, analysisTranscript]);
      return;
    }

    // Handle regular transcript messages
    const newTranscript: Transcript = {
      speaker: data.speaker_name || 'Unknown',
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
        return [...otherTranscripts, newTranscript];
      }

      if (data.message_type === 'final_transcript' || data.message_type === 'enriched_transcript') {
        const otherTranscripts = prev.filter(t =>
          !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
        );
        return [...otherTranscripts, newTranscript];
      }

      return [...prev, newTranscript];
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

  // Auto-connect to transcript stream when component mounts
  useEffect(() => {
    const initializeTranscriptStream = async () => {
      try {
        setStatus('Connecting to transcript stream...');
        await connect();
        setStatus('Ready - Listening for transcripts');
        setBotStatus('running');
      } catch (error) {
        console.error('Failed to connect to transcript stream:', error);
        setStatus('Failed to connect to transcripts');
        setBotStatus('error');
      }
    };

    initializeTranscriptStream();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const checkBotStatus = async (): Promise<void> => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/bot/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        setBotStatus(data.status || 'idle');
        if (data.status === 'running' && data.start_time) {
          setSessionStartTime(new Date(data.start_time).getTime());
        }
      }
    } catch (error) {
      console.error('Failed to check bot status:', error);
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
        additionalData: JSON.stringify({
          timestamp: Date.now(),
          transcripts: transcripts.slice(0, 10)
        })
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

  const refreshMeetingInfo = async (): Promise<void> => {
    if (!sidePanelClient) return;
    try {
      const info = await sidePanelClient.getMeetingInfo();
      setMeetingInfo(info);
      console.log('Meeting info refreshed:', info);
      setStatus(`Meeting: ${info.meetingCode || 'Unknown ID'}`);
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
            <AIOrb isActive={isConnected} size="w-8 h-8" />
          </div>
          <p className="text-white/60 text-lg">Real-time meeting intelligence & analysis</p>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card title="Transcript Controls" glowing={isConnected}>
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-white/70 text-sm">
                  Listening to real-time transcripts and AI analysis from the meeting.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => connect()}
                    disabled={isConnected || loading}
                    loading={loading && isConnected}
                    variant="success"
                    className="flex-1"
                  >
                    {isConnected ? 'Connected' : 'Connect'}
                  </Button>
                  <Button
                    onClick={() => disconnect()}
                    disabled={!isConnected}
                    variant="secondary"
                    className="flex-1"
                  >
                    Disconnect
                  </Button>
                </div>
                <Button onClick={clearTranscripts} variant="secondary" className="w-full">
                  Clear All
                </Button>
                {!isConnected && (
                  <p className="text-yellow-400 text-xs">
                    {connectionStatus}
                  </p>
                )}
              </div>
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
                onClick={refreshMeetingInfo}
                disabled={!sidePanelClient}
                variant="secondary"
                className="w-full"
              >
                Refresh Meeting Info
              </Button>
              <p className="text-white/50 text-xs mt-2">
                Main stage displays transcripts and AI insights to all participants.
              </p>
            </div>
          </Card>
        </div>

        {/* Transcripts and Analysis Stream */}
        <Card title="Real-time Transcripts & AI Insights" glowing={isConnected}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-white/60">
              {transcripts.length} message{transcripts.length !== 1 ? 's' : ''} •
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
                {isConnected ? (
                  <>
                    <AIOrb isActive={true} size="w-16 h-16 mx-auto mb-4" />
                    <p className="mb-2">Listening for transcripts and AI analysis...</p>
                    <p className="text-sm">Regular transcripts and AI insights will appear here as the meeting progresses.</p>
                  </>
                ) : (
                  <>
                    <p className="mb-2">Connect to start receiving real-time insights</p>
                    <p className="text-sm">Transcripts and AI analysis will appear here automatically.</p>
                  </>
                )}
              </div>
            )}

            <div className="space-y-4">
              {transcripts.map((transcript, index) => (
                <TranscriptEntry
                  key={`${transcript.timestamp}-${index}`}
                  transcript={transcript}
                  showSpeaker={false} // Remove speaker labels as requested
                />
              ))}
            </div>

            <div ref={transcriptsEndRef} />
          </div>
        </Card>

        {/* Debug Info - Remove in production */}
        {/* <Card title="Debug Info" className="mt-6">
          <div className="space-y-2 text-sm">
            <div>WebSocket ConnecteanscriConnected ? 'Connected' : 'Disconnected'</div>
            <div>Connection Status: {connectionStatus}</div>
            <div>Last Message: {lastMessageTime ? new Date(lastMessageTime).toLocaleTimeString() : 'Never'}</div>
            <div>Reconnect Attempts: {reconnectAttempts}</div>
            <div>Data Received: {formatBytes(bytesReceived)}</div>
            <div>Transcript Count: {transcripts.length}</div>
            <div>Analysis Messages: {transcripts.filter(t => t.messageType === 'analysis').length}</div>
          </div>
        </Card> */}
      </div>
    </div>
  );
}