'use client';

import { useEffect, useState, useRef } from 'react';
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

export default function SidePanel() {
    const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [status, setStatus] = useState('Initializing...');
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const wsPromiseRef = useRef<Promise<void> | null>(null);

    useEffect(() => {
        const initializeAddon = async () => {
            try {
                const session = await meet.addon.createAddonSession({
                    cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
                });
                const client = await session.createSidePanelClient();
                setSidePanelClient(client);
                setStatus('Addon session initialized');

                client.on('frameToFrameMessage', (event) => {
                    console.log('Frame to frame message:', event);
                });

            } catch (error) {
                console.error('Error initializing addon:', error);
                setStatus('Failed to initialize addon');
            }
        };

        initializeAddon();
    }, []);

    const connectToBackend = () => {
        if (wsPromiseRef.current) return wsPromiseRef.current;

        wsPromiseRef.current = new Promise<void>((resolve, reject) => {
            try {
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'ws://localhost:3000';
                wsRef.current = new WebSocket(`${backendUrl}/ws/audio`);

                wsRef.current.onopen = () => {
                    setIsConnected(true);
                    setStatus('Connected to backend');
                    resolve();
                };

                wsRef.current.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data as string);

                        if (data.message_type === 'enriched_transcript') {
                            const newTranscript: Transcript = {
                                speaker: data.speaker_name,
                                text: data.transcript,
                                analysis: data.analysis,
                                timestamp: Date.now(),
                                isFinal: true
                            };

                            setTranscripts(prev => {
                                if (prev.length > 0 && !prev[0].isFinal) {
                                    return [newTranscript, ...prev.slice(1)];
                                }
                                return [newTranscript, ...prev];
                            });

                        } else if (data.message_type === 'PartialTranscript') {
                            const interimTranscript: Transcript = {
                                speaker: data.speaker_name || 'Speaker',
                                text: data.transcript,
                                timestamp: Date.now(),
                                isFinal: false,
                            };

                            setTranscripts(prev => {
                                if (prev.length > 0 && !prev[0].isFinal) {
                                    return [interimTranscript, ...prev.slice(1)];
                                }
                                return [interimTranscript, ...prev];
                            });
                        }
                    } catch (error) {
                        console.error('Error processing WebSocket message:', error);
                    }
                };

                wsRef.current.onclose = () => {
                    setIsConnected(false);
                    setStatus('Disconnected from backend');
                    wsPromiseRef.current = null;
                };

                wsRef.current.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    setStatus('Backend connection error'); client.on('frameToFrameMessage', (event) => {

                    wsRef.current?.close();
                    reject(error);
                };
            } catch (error) {
                console.error('Error connecting to backend:', error);
                setStatus('Failed to connect to backend');
                reject(error);
            }
        });
        return wsPromiseRef.current;
    };

    const startStreaming = async () => {
        if (!sidePanelClient) {
            setStatus('Side panel client not initialized');
            return;
        }

        try {
            await connectToBackend();

            setStatus('Requesting microphone access...');

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                stream.getTracks().forEach(track => track.stop());

                setIsStreaming(true);
                setStatus('Microphone access granted (note: this captures your microphone, not Meet audio)');

            } catch (micError) {
                console.error('Microphone access error:', micError);
                setStatus('Microphone access denied');

                const meetingInfo = await sidePanelClient.getMeetingInfo();
                console.log('Meeting info:', meetingInfo);
                setStatus(`Connected to meeting: ${meetingInfo.meetingId || 'Unknown'}`);
            }

        } catch (error) {
            console.error('Error starting stream:', error);
            setStatus(`Failed to start streaming: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const stopStreaming = () => {
        setIsStreaming(false);
        setStatus('Streaming stopped');
    };

    const startActivity = async () => {
        if (!sidePanelClient) {
            throw new Error('Side Panel is not yet initialized!');
        }

        const activityStartingState = {};

        await sidePanelClient.startActivity(activityStartingState);
    };

    const getMeetingInfo = async () => {
        if (!sidePanelClient) {
            setStatus('Side panel client not initialized');
            return;
        }

        try {
            const meetingInfo = await sidePanelClient.getMeetingInfo();
            console.log('Meeting info:', meetingInfo);
            setStatus(`Meeting ID: ${meetingInfo.meetingId || 'Unknown'}`);
        } catch (error) {
            console.error('Error getting meeting info:', error);
            setStatus('Failed to get meeting info');
        }
    };

    return (
        <div className="p-6 font-sans">
            <h1 className="text-2xl font-bold mb-4">Meet Audio Streamer</h1>

            <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                <p><strong>Status:</strong> {status}</p>
                <p><strong>Backend:</strong> {isConnected ? 'Connected' : 'Disconnected'}</p>
                <p><strong>Streaming:</strong> {isStreaming ? 'Active' : 'Inactive'}</p>
                <p><strong>Side Panel Client:</strong> {sidePanelClient ? 'Ready' : 'Not initialized'}</p>
            </div>

            <div className="flex flex-wrap gap-4 mb-6">
                {!isStreaming ? (
                    <button
                        onClick={startStreaming}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                        Start Streaming
                    </button>
                ) : (
                    <button
                        onClick={stopStreaming}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                    >
                        Stop Streaming
                    </button>
                )}

                <button
                    onClick={startActivity}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                >
                    Open in Main Stage
                </button>

                <button
                    onClick={getMeetingInfo}
                    className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                >
                    Get Meeting Info
                </button>
            </div>

            <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
                <h3 className="font-bold text-yellow-800 mb-2">Important Note</h3>
                <p className="text-yellow-700">
                    The Google Meet Add-ons API does not currently provide direct access to the meeting&apos;s audio stream.
                    This add-on can access meeting information and start activities, but cannot directly capture audio from the meeting.
                </p>
            </div>

            <div>
                <h2 className="text-xl font-semibold mb-3">Transcripts</h2>
                <div className="h-96 overflow-y-auto border border-gray-300 rounded-lg p-4 bg-white">
                    {transcripts.length === 0 ? (
                        <p className="text-gray-500">No transcripts yet. Start streaming to see results.</p>
                    ) : (
                        transcripts.map((transcript, index) => (
                            <div
                                key={index}
                                className={`mb-4 p-3 rounded-lg ${transcript.isFinal ? 'bg-gray-50' : 'bg-yellow-50'}`}
                            >
                                <div className="font-bold text-blue-600">
                                    {transcript.speaker}:
                                </div>
                                <div>{transcript.text}</div>
                                {transcript.analysis && transcript.isFinal && (
                                    <div className="mt-2 text-sm text-gray-600">
                                        <div><strong>Summary:</strong> {transcript.analysis.summary}</div>
                                        <div><strong>Semantics:</strong> {transcript.analysis.semantics}</div>
                                        {transcript.analysis.questions && transcript.analysis.questions.length > 0 && (
                                            <div>
                                                <strong>Follow-up questions:</strong>
                                                <ul className="list-disc pl-5 mt-1">
                                                    {transcript.analysis.questions.map((q, i) => (
                                                        <li key={i}>{q}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}