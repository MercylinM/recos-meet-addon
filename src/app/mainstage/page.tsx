/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useState, useRef, useCallback, ReactNode, JSXElementConstructor, Key, ReactElement, ReactPortal } from 'react';
import { meet } from '@googleworkspace/meet-addons/meet.addons';
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

interface Analysis {
    actionItems: any;
    keyPoints: any;
    summary: ReactNode;
    sentiment: string;
    detected_question?: string;
    candidate_answer_summary?: string;
    semantics?: string;
    questions?: string[];
    confidence?: number;
    keywords?: string[];
    answer_quality?: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
    timestamp: number;
}

export default function MainStage() {
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [analyses, setAnalyses] = useState<Analysis[]>([]);
    const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
    const transcriptsEndRef = useRef<HTMLDivElement>(null);
    const analysesEndRef = useRef<HTMLDivElement>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('Initializing...');

    // Debug effects
    useEffect(() => {
        console.log('Current transcripts:', transcripts);
    }, [transcripts]);

    useEffect(() => {
        console.log('Current analyses:', analyses);
    }, [analyses]);

    useEffect(() => {
        const initializeMainStage = async () => {
            try {
                const session = await meet.addon.createAddonSession({
                    cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
                });

                await session.createCoDoingClient({
                    activityTitle: "Recos AI Analysis",
                    onCoDoingStateChanged: (coDoingState) => {
                        const state = JSON.parse(new TextDecoder().decode(coDoingState.bytes));
                        console.log("Mainstage received state update:", state);
                        if (state.transcripts) {
                            setTranscripts(state.transcripts);
                        }
                        if (state.analyses) {
                            setAnalyses(state.analyses);
                        }
                        if (state.isConnected !== undefined) {
                            setIsConnected(state.isConnected);
                        }
                        if (state.connectionStatus) {
                            setConnectionStatus(state.connectionStatus);
                        }
                    },
                });
                console.log('Main Stage co-doing client initialized successfully');

            } catch (error) {
                console.error('Failed to initialize Main Stage:', error);
            }
        };

        initializeMainStage();
    }, []);

    useEffect(() => {
        transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcripts]);

    useEffect(() => {
        analysesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [analyses]);

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

    const getSentimentColor = (sentiment: string) => {
        switch (sentiment) {
            case 'positive': return 'from-green-500 to-green-600';
            case 'negative': return 'from-red-500 to-red-600';
            default: return 'from-gray-500 to-gray-600';
        }
    };

    const getSentimentText = (sentiment: string) => {
        switch (sentiment) {
            case 'positive': return 'Positive';
            case 'negative': return 'Negative';
            default: return 'Neutral';
        }
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
                                <div className="flex flex-col">
                                    <span className="text-white/90 text-sm font-medium">
                                        {isConnected ? 'Live - Receiving Data' : connectionStatus}
                                    </span>
                                    {/* <span className="text-white/60 text-xs">
                                        {transcripts.length} transcripts • {analyses.length} insights
                                    </span> */}
                                </div>
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

                        {/* Stats */}
                        <div className="bg-[#141244]/60 backdrop-blur-md rounded-xl px-6 py-3 border border-[#803ceb]/20">
                            <div className="flex items-center gap-3">
                                <svg className="w-4 h-4 text-[#803ceb]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-white/90 text-sm font-medium">
                                    {transcripts.length} transcripts • {analyses.length} insights
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content - Split Layout */}
                <div className="flex-1 flex gap-6 overflow-hidden">
                    {/* Left Panel - Analysis (70% width) */}
                    <div className="flex-1 flex flex-col">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#803ceb] to-[#a855f7] flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white">AI Analysis</h2>
                        </div>

                        <div className="flex-1 bg-gradient-to-r from-[#141244]/40 to-[#1a1458]/30 backdrop-blur-md rounded-2xl border border-[#803ceb]/20 p-6 overflow-y-auto custom-scrollbar">
                            {analyses.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <AIOrb isActive={isConnected} size="w-20 h-20 mb-4" />
                                    <h3 className="text-2xl font-bold text-white/90 mb-3">
                                        {isConnected ? 'Analyzing conversation...' : 'Waiting for analysis...'}
                                    </h3>
                                    <p className="text-white/60 text-lg max-w-md">
                                        AI insights will appear here as the meeting progresses.
                                        {!isConnected}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {analyses.map((analysis, index) => (
                                        <div
                                            key={`${analysis.timestamp}-${index}`}
                                            className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-[#803ceb]/30 transition-all duration-300"
                                        >
                                            {/* Analysis Header */}
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${getSentimentColor(analysis.sentiment)} flex items-center justify-center text-white font-bold shadow-lg`}>
                                                        {analysis.sentiment.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="text-white font-semibold">
                                                            {getSentimentText(analysis.sentiment)} Analysis
                                                        </div>
                                                        <div className="text-white/40 text-sm">
                                                            {new Date(analysis.timestamp).toLocaleTimeString()}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="text-white/60 text-sm">Confidence:</div>
                                                    <div className="px-3 py-1 bg-gradient-to-r from-[#803ceb]/20 to-[#a855f7]/20 rounded-full text-[#803ceb] text-sm font-medium border border-[#803ceb]/30">
                                                        {Math.round((analysis.confidence ?? 0) * 100)}%
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Summary */}
                                            <div className="mb-6">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <svg className="w-5 h-5 text-[#803ceb]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                    </svg>
                                                    <span className="text-[#803ceb] font-semibold text-lg">Summary</span>
                                                </div>
                                                <p className="text-white/90 text-lg leading-relaxed bg-[#803ceb]/5 rounded-lg p-4 border border-[#803ceb]/10">
                                                    {analysis.summary}
                                                </p>
                                            </div>

                                            {/* Key Points */}
                                            {analysis.keyPoints.length > 0 && (
                                                <div className="mb-6">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        <span className="text-green-400 font-semibold text-lg">Key Points</span>
                                                    </div>
                                                    <ul className="space-y-2">
                                                        {analysis.keyPoints.map((point: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined, i: Key | null | undefined) => (
                                                            <li key={i} className="text-white/80 text-base flex items-start gap-3 bg-green-500/5 rounded-lg p-3 border border-green-500/10">
                                                                <span className="text-green-400 font-bold mt-1">•</span>
                                                                <span>{point}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {/* Action Items */}
                                            {analysis.actionItems.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                        </svg>
                                                        <span className="text-orange-400 font-semibold text-lg">Action Items</span>
                                                    </div>
                                                    <ul className="space-y-2">
                                                        {analysis.actionItems.map((item: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined, i: Key | null | undefined) => (
                                                            <li key={i} className="text-white/80 text-base flex items-start gap-3 bg-orange-500/5 rounded-lg p-3 border border-orange-500/10">
                                                                <span className="text-orange-400 font-bold mt-1">•</span>
                                                                <span>{item}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    <div ref={analysesEndRef} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Panel - Final Transcripts (30% width) */}
                    <div className="w-1/3 flex flex-col">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-bold text-white">Transcripts</h2>
                        </div>

                        <div className="flex-1 bg-gradient-to-r from-[#141244]/40 to-[#1a1458]/30 backdrop-blur-md rounded-2xl border border-blue-500/20 p-6 overflow-y-auto custom-scrollbar">
                            {transcripts.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <svg className="w-12 h-12 text-blue-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-white/60 text-base">
                                        {isConnected ? 'Listening for conversation...' : 'Waiting for connection...'}
                                    </p>
                                    <p className="text-white/40 text-sm mt-2">
                                        Transcripts will appear here as they are processed.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {transcripts.map((transcript, index) => (
                                        <div
                                            key={`${transcript.timestamp}-${index}`}
                                            className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 hover:border-blue-500/30 transition-colors"
                                        >
                                            {/* Speaker Header */}
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getSpeakerColor(transcript.speaker)} flex items-center justify-center text-white font-bold text-sm`}>
                                                    {transcript.speaker.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-white font-semibold text-sm">
                                                            {transcript.speaker}
                                                        </span>
                                                        <span className="text-white/40 text-xs">
                                                            {new Date(transcript.timestamp).toLocaleTimeString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Transcript Text */}
                                            <p className="text-white/80 text-sm leading-relaxed mb-2">
                                                {transcript.text}
                                            </p>

                                            {/* Show analysis if available */}
                                            {transcript.analysis && (
                                                <div className="mt-2 p-3 bg-[#803ceb]/10 rounded-lg border border-[#803ceb]/20">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <svg className="w-3 h-3 text-[#803ceb]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                        </svg>
                                                        <span className="text-[#803ceb] text-xs font-semibold">AI Analysis</span>
                                                    </div>
                                                    <p className="text-white/70 text-xs mb-2">{transcript.analysis.summary}</p>
                                                    {transcript.analysis.keywords && transcript.analysis.keywords.length > 0 && (
                                                        <div className="flex flex-wrap gap-1">
                                                            {transcript.analysis.keywords.slice(0, 3).map((keyword, i) => (
                                                                <span key={i} className="px-2 py-1 bg-[#803ceb]/20 rounded text-xs text-[#803ceb]">
                                                                    {keyword}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Message type badge */}
                                            <div className="flex justify-between items-center mt-2">
                                                <span className="text-white/40 text-xs">
                                                    {transcript.isFinal ? 'Final' : 'Interim'}
                                                </span>
                                                {transcript.messageType === 'enriched_transcript' && (
                                                    <span className="px-2 py-1 bg-green-500/20 rounded text-xs text-green-400">
                                                        Analyzed
                                                    </span>
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
        </div>
    );
}