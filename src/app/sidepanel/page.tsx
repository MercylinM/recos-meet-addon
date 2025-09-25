'use client';

import { useEffect, useState, useRef } from 'react';
import {
    meet,
    MeetSidePanelClient,
    AddonSession,
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
    const [addonSession, setAddonSession] = useState<AddonSession>();
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [status, setStatus] = useState('Initializing...');
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);

    const wsPromiseRef = useRef<Promise<void> | null>(null);

    useEffect(() => {
        const initializeAddon = async () => {
            try {
                const session = await meet.addon.createAddonSession({
                    cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
                });
                const client = await session.createSidePanelClient();
                setAddonSession(session);
                setSidePanelClient(client);
                setStatus('Addon session initialized');
            } catch (error) {
                console.error('Error initializing addon:', error);
                setStatus('Failed to initialize addon');
            }
        };

        initializeAddon();
    }, []);

    // Connect to backend WebSocket and return a promise that resolves on open
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
                    setStatus('Backend connection error');
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
        if (!addonSession) {
            setStatus('Addon session not initialized');
            return;
        }

        try {
            await connectToBackend(); 

            setStatus('Requesting audio access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            if (!stream) {
                setStatus('Failed to get audio stream');
                return;
            }

            mediaStreamRef.current = stream;
            audioContextRef.current = new window.AudioContext();

            await audioContextRef.current.audioWorklet.addModule('./components/AudioProcessor');

            const source = audioContextRef.current.createMediaStreamSource(stream);

            audioWorkletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'audio-processor');

            audioWorkletNodeRef.current.port.onmessage = (event) => {
                if (event.data.type === 'audioData') {
                    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                        wsRef.current.send(event.data.buffer);
                    }
                }
            };

            source.connect(audioWorkletNodeRef.current);
            audioWorkletNodeRef.current.connect(audioContextRef.current.destination);

            setIsStreaming(true);
            setStatus('Streaming audio to backend');

        } catch (error) {
            console.error('Error starting stream:', error);
            setStatus('Failed to start streaming');
        }
    };

    const stopStreaming = () => {
        if (audioWorkletNodeRef.current) {
            audioWorkletNodeRef.current.disconnect();
            audioWorkletNodeRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        setIsStreaming(false);
        setStatus('Streaming stopped');

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
    };

    const startActivity = async () => {
        if (!sidePanelClient) {
            throw new Error('Side Panel is not yet initialized!');
        }
        await sidePanelClient.startActivity({
            mainStageUrl: `${window.location.origin}/mainstage`
        });
    };

    return (
        <div className="p-6 font-sans">
            <h1 className="text-2xl font-bold mb-4">Meet Audio Streamer</h1>

            <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                <p><strong>Status:</strong> {status}</p>
                <p><strong>Backend:</strong> {isConnected ? 'Connected' : 'Disconnected'}</p>
                <p><strong>Streaming:</strong> {isStreaming ? 'Active' : 'Inactive'}</p>
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
                                className={`mb-4 p-3 rounded-lg ${transcript.isFinal ? 'bg-gray-50' : 'bg-yellow-50'
                                    }`}
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