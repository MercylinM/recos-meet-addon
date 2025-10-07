'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { meet } from '@googleworkspace/meet-addons/meet.addons';
import { useTranscriptStream } from '../hooks/useTranscriptStream';
import { AIOrb } from '../components/AIOrb';
import { formatDuration } from '../utils/formatters';

interface Transcript {
    speaker: string;
    text: string;
    timestamp: number;
    isFinal: boolean;
    messageType: string;
    analysis?: {
        summary?: string;
        keywords?: string[];
        questions?: string[];
        semantics?: string;
        confidence?: number;
    };
}

export default function MainStage() {
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
    const transcriptsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const initializeMainStage = async () => {
            try {
                const session = await meet.addon.createAddonSession({
                    cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
                });
                await session.createMainStageClient();
                console.log('Main Stage initialized successfully');
            } catch (error) {
                console.error('Failed to initialize Main Stage:', error);
            }
        };

        initializeMainStage();
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleTranscriptReceived = useCallback((data: any) => {
        const newTranscript: Transcript = {
            speaker: data.speaker_name || 'Unknown Speaker',
            text: data.transcript,
            timestamp: data.timestamp || Date.now(),
            isFinal: data.is_final || false,
            messageType: data.message_type,
            analysis: data.analysis
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

    const { isConnected, connectionStatus } = useTranscriptStream(handleTranscriptReceived);

    useEffect(() => {
        transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcripts]);

    const sessionDuration = Math.floor((Date.now() - sessionStartTime) / 1000);

    const getSpeakerColor = (speaker: string) => {
        const colors = [
            'from-blue-500 to-blue-600',
            'from-green-500 to-green-600',
            'from-purple-500 to-purple-600',
            'from-pink-500 to-pink-600',
            'from-orange-500 to-orange-600',
            'from-cyan-500 to-cyan-600',
        ];
        const hash = speaker.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141244] to-[#1a1458] text-white">
            {/* Animated background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#803ceb]/10 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-[#803ceb]/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#a855f7]/10 rounded-full blur-2xl animate-pulse delay-500"></div>
            </div>

            <div className="relative z-10 h-screen flex flex-col p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <AIOrb isActive={isConnected} size="w-10 h-10" />
                        <div>
                            <h1 className="text-5xl font-bold bg-gradient-to-r from-white to-[#803ceb] bg-clip-text text-transparent">
                                Recos AI
                            </h1>
                            <p className="text-white/60 text-lg mt-1">Real-time Meeting Intelligence</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Connection Status */}
                        <div className="bg-[#141244]/60 backdrop-blur-md rounded-xl px-6 py-3 border border-[#803ceb]/20">
                            <div className="flex items-center gap-3">
                                <AIOrb isActive={isConnected} size="w-3 h-3" />
                                <span className="text-white/90 text-sm font-medium">
                                    {isConnected ? 'Live' : connectionStatus}
                                </span>
                            </div>
                        </div>

                        {/* Session Duration */}
                        <div className="bg-[#141244]/60 backdrop-blur-md rounded-xl px-6 py-3 border border-[#803ceb]/20">
                            <div className="flex items-center gap-3">
                                <svg className="w-4 h-4 text-[#803ceb]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-white/90 text-sm font-medium">
                                    {formatDuration(sessionDuration)}
                                </span>
                            </div>
                        </div>

                        {/* Transcript Count */}
                        <div className="bg-[#141244]/60 backdrop-blur-md rounded-xl px-6 py-3 border border-[#803ceb]/20">
                            <div className="flex items-center gap-3">
                                <svg className="w-4 h-4 text-[#803ceb]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-white/90 text-sm font-medium">
                                    {transcripts.length} transcripts
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Transcripts Feed */}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#141244]/40 to-[#1a1458]/30 backdrop-blur-md rounded-2xl border border-[#803ceb]/20 p-6 overflow-y-auto custom-scrollbar">
                        {transcripts.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center">
                                <AIOrb isActive={isConnected} size="w-24 h-24 mb-6" />
                                <h2 className="text-3xl font-bold text-white/90 mb-4">
                                    {isConnected ? 'Listening for audio...' : 'Waiting for connection...'}
                                </h2>
                                <p className="text-white/60 text-xl max-w-2xl">
                                    Transcripts and AI insights will appear here in real-time as participants speak.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {transcripts.map((transcript, index) => (
                                    <div
                                        key={`${transcript.timestamp}-${index}`}
                                        className={`group ${transcript.messageType === 'interim_transcript'
                                                ? 'opacity-60'
                                                : 'opacity-100'
                                            } transition-opacity duration-300`}
                                    >
                                        {/* Speaker Header */}
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getSpeakerColor(transcript.speaker)} flex items-center justify-center text-white font-bold shadow-lg`}>
                                                {transcript.speaker.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-white font-semibold text-lg">
                                                        {transcript.speaker}
                                                    </span>
                                                    <span className="text-white/40 text-sm">
                                                        {new Date(transcript.timestamp).toLocaleTimeString()}
                                                    </span>
                                                    {transcript.messageType === 'interim_transcript' && (
                                                        <span className="text-yellow-400 text-xs px-2 py-1 bg-yellow-400/10 rounded-full border border-yellow-400/20">
                                                            Transcribing...
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Transcript Text */}
                                        <div className="ml-13 bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 hover:border-[#803ceb]/30 transition-colors">
                                            <p className="text-white/90 text-lg leading-relaxed">
                                                {transcript.text}
                                            </p>

                                            {/* AI Analysis */}
                                            {transcript.analysis && transcript.messageType === 'enriched_transcript' && (
                                                <div className="mt-5 pt-5 border-t border-white/10 space-y-4">
                                                    {/* Summary */}
                                                    {transcript.analysis.summary && (
                                                        <div className="bg-[#803ceb]/10 rounded-lg p-4 border border-[#803ceb]/20">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <svg className="w-4 h-4 text-[#803ceb]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                                </svg>
                                                                <span className="text-[#803ceb] font-semibold text-sm uppercase tracking-wide">
                                                                    AI Summary
                                                                </span>
                                                            </div>
                                                            <p className="text-white/80 text-base">
                                                                {transcript.analysis.summary}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Keywords */}
                                                    {transcript.analysis.keywords && transcript.analysis.keywords.length > 0 && (
                                                        <div className="flex flex-wrap gap-2">
                                                            <span className="text-white/60 text-sm font-medium">Keywords:</span>
                                                            {transcript.analysis.keywords.map((keyword, i) => (
                                                                <span
                                                                    key={i}
                                                                    className="px-3 py-1 bg-gradient-to-r from-[#803ceb]/20 to-[#a855f7]/20 rounded-full text-[#803ceb] text-sm font-medium border border-[#803ceb]/30"
                                                                >
                                                                    {keyword}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Follow-up Questions */}
                                                    {transcript.analysis.questions && transcript.analysis.questions.length > 0 && (
                                                        <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                                                            <div className="flex items-center gap-2 mb-3">
                                                                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                                <span className="text-blue-400 font-semibold text-sm uppercase tracking-wide">
                                                                    Suggested Follow-ups
                                                                </span>
                                                            </div>
                                                            <ul className="space-y-2">
                                                                {transcript.analysis.questions.map((question, i) => (
                                                                    <li key={i} className="text-white/80 text-base flex items-start gap-2">
                                                                        <span className="text-blue-400 font-bold">•</span>
                                                                        <span>{question}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Confidence Score */}
                                                    {transcript.analysis.confidence && (
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-white/60 text-sm">AI Confidence:</span>
                                                            <div className="flex-1 max-w-xs bg-white/10 rounded-full h-2 overflow-hidden">
                                                                <div
                                                                    className="h-full bg-gradient-to-r from-[#803ceb] to-[#a855f7] rounded-full transition-all duration-500"
                                                                    style={{ width: `${transcript.analysis.confidence * 100}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-white/90 text-sm font-medium">
                                                                {Math.round(transcript.analysis.confidence * 100)}%
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <div ref={transcriptsEndRef} />
                            </div>
                        )}
                    </div>
                </div>

                
            </div>

           
        </div>
    );
}