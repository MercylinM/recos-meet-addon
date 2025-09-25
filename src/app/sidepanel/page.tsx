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

interface SoxStatus {
    running: boolean;
    pid: number | null;
    startTime: string | null;
    device: string | null;
}

interface AudioDevice {
    name: string;
    description: string;
}

export default function SidePanel() {
    const [sidePanelClient, setSidePanelClient] = useState<MeetSidePanelClient>();
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [status, setStatus] = useState('Initializing...');
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [soxStatus, setSoxStatus] = useState<SoxStatus>({
        running: false,
        pid: null,
        startTime: null,
        device: null,
    });
    const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
    const [selectedDevice, setSelectedDevice] = useState('default');
    const [loading, setLoading] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const wsPromiseRef = useRef<Promise<void> | null>(null);
    const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        'https://recos-add-on-backend.onrender.com';

    useEffect(() => {
        const initializeAddon = async () => {
            try {
                const session = await meet.addon.createAddonSession({
                    cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
                });
                const client = await session.createSidePanelClient();
                setSidePanelClient(client);
                setStatus('Addon session initialized');

                // Example event listener on client if needed
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

    const fetchSoxStatus = useCallback(async () => {
        try {
            const response = await fetch(`${backendUrl}/api/sox/status`);
            const data = await response.json();
            setSoxStatus(data);
        } catch (error) {
            console.error('Error fetching SoxClient status:', error);
            setSoxStatus({
                running: false,
                pid: null,
                startTime: null,
                device: null,
            });
        }
    }, [backendUrl]);

    const fetchAudioDevices = useCallback(async () => {
        try {
            const response = await fetch(`${backendUrl}/api/sox/devices`);
            const data = await response.json();
            if (data.success) {
                setAudioDevices(data.devices);
            }
        } catch (error) {
            console.error('Error fetching audio devices:', error);
            setAudioDevices([
                { name: 'default', description: 'Default input device' },
                { name: 'monitor', description: 'Monitor of output device' },
            ]);
        }
    }, [backendUrl]);

    useEffect(() => {
        if (isConnected) {
            fetchSoxStatus();
            fetchAudioDevices();
        }
    }, [isConnected, fetchSoxStatus, fetchAudioDevices]);


    const connectToBackend = () => {
        if (wsPromiseRef.current) return wsPromiseRef.current;

        wsPromiseRef.current = new Promise<void>((resolve, reject) => {
            try {
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
        if (!sidePanelClient) {
            setStatus('Side panel client not initialized');
            return;
        }
        try {
            await connectToBackend();
            setIsStreaming(true);
            setStatus('Streaming to backend');
        } catch (error) {
            console.error('Error starting stream:', error);
            setStatus(
                `Failed to connect to backend: ${error instanceof Error ? error.message : 'Unknown error'
                }`
            );
        }
    };

    const stopStreaming = () => {
        setIsStreaming(false);
        setStatus('Disconnected from backend');
    };

    const startSoxClient = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${backendUrl}/api/sox/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device: selectedDevice }),
            });

            const data = await response.json();

            if (data.success) {
                setStatus(`SoxClient started (PID: ${data.pid})`);
                setTimeout(() => fetchSoxStatus(), 2000);
            } else {
                setStatus(`Failed to start SoxClient: ${data.message}`);
            }
        } catch (error) {
            console.error('Error starting SoxClient:', error);
            setStatus(
                `Error starting SoxClient: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            setLoading(false);
        }
    };

    const stopSoxClient = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${backendUrl}/api/sox/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json();

            if (data.success) {
                setStatus('SoxClient stopped');
                fetchSoxStatus();
            } else {
                setStatus(`Failed to stop SoxClient: ${data.message}`);
            }
        } catch (error) {
            console.error('Error stopping SoxClient:', error);
            setStatus(
                `Error stopping SoxClient: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        } finally {
            setLoading(false);
        }
    };

    const refreshStatus = () => {
        fetchSoxStatus();
    };

    const startActivity = async () => {
        if (!sidePanelClient) throw new Error('Side Panel is not yet initialized!');
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

    const formatStartTime = (startTime: string | null) => {
        if (!startTime) return 'N/A';
        const date = new Date(startTime);
        return date.toLocaleTimeString();
    };

    return (
        <div className="p-6 font-sans">
            <h1 className="text-2xl font-bold mb-4">Meet Audio Streamer</h1>
            <div className="mb-6 p-4 text-black bg-gray-100 rounded-lg">
                <p>
                    <strong>Status:</strong> {status}
                </p>
                <p>
                    <strong>Backend:</strong> {isConnected ? 'Connected' : 'Disconnected'}
                </p>
                <p>
                    <strong>Streaming:</strong> {isStreaming ? 'Active' : 'Inactive'}
                </p>
                <p>
                    <strong>SoxClient:</strong>{' '}
                    {soxStatus.running
                        ? `Running (PID: ${soxStatus.pid}, Device: ${soxStatus.device})`
                        : 'Not running'}
                </p>
                <p>
                    <strong>Side Panel Client:</strong> {sidePanelClient ? 'Ready' : 'Not initialized'}
                </p>
            </div>
            <div className="flex flex-wrap gap-4 mb-6">
                {!isStreaming ? (
                    <button
                        onClick={startStreaming}
                        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                        Connect to Backend
                    </button>
                ) : (
                    <button
                        onClick={stopStreaming}
                        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                    >
                        Disconnect
                    </button>
                )}
                <button
                    onClick={refreshStatus}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                >
                    Refresh Status
                </button>
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
                <h3 className="font-bold text-yellow-800 mb-2">SoxClient Controls</h3>
                <div className="mb-4">
                    <label
                        htmlFor="deviceSelect"
                        className="block text-sm font-medium text-yellow-700 mb-1"
                    >
                        Audio Device:
                    </label>
                    <select
                        id="deviceSelect"
                        value={selectedDevice}
                        onChange={(e) => setSelectedDevice(e.target.value)}
                        className="w-full p-2 border border-yellow-300 text-black rounded bg-white"
                        disabled={loading || soxStatus.running}
                    >
                        {audioDevices.map((device) => (
                            <option key={device.name} value={device.name}>
                                {device.name} - {device.description}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-wrap gap-4">
                    {!soxStatus.running ? (
                        <button
                            onClick={startSoxClient}
                            disabled={loading || !isConnected}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Starting...' : 'Start SoxClient'}
                        </button>
                    ) : (
                        <button
                            onClick={stopSoxClient}
                            disabled={loading}
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Stopping...' : 'Stop SoxClient'}
                        </button>
                    )}
                </div>
                {soxStatus.running && soxStatus.startTime && (
                    <div className="mt-2 text-sm text-yellow-700">
                        Started at: {formatStartTime(soxStatus.startTime)}
                    </div>
                )}
            </div>
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-bold text-blue-800 mb-2">How to Use This Add-on</h3>
                <ol className="list-decimal pl-5 text-blue-700">
                    <li>Connect to the backend using the button above</li>
                    <li>Select an audio device from the dropdown</li>
                    <li>Click &quot;Start SoxClient&quot; to begin audio capture</li>
                    <li>Open a Google Meet meeting</li>
                    <li>Make sure your system audio is set up to capture the meeting audio</li>
                    <li>Transcripts will appear here in real-time</li>
                </ol>
            </div>
            <div className="mb-6 p-4 bg-green-50 rounded-lg">
                <h3 className="font-bold text-green-800 mb-2">Audio Setup Tips</h3>
                <ul className="list-disc pl-5 text-green-700">
                    <li>Use headphones to prevent echo and feedback</li>
                    <li>Set your system audio output to a reasonable volume</li>
                    <li>Use the &quot;monitor&quot; device to capture system audio directly</li>
                    <li>Make sure your microphone isn&apos;t picking up speaker output</li>
                    <li>If using PulseAudio, select the specific device that&apos;s capturing the meeting audio</li>
                </ul>
            </div>
            <div>
                <h2 className="text-xl font-semibold mb-3">Transcripts</h2>
                <div className="h-96 overflow-y-auto border border-gray-300 rounded-lg p-4 bg-white">
                    {transcripts.length === 0 ? (
                        <p className="text-gray-500">
                            No transcripts yet. Connect to the backend and start SoxClient to see results.
                        </p>
                    ) : (
                        transcripts.map((transcript, index) => (
                            <div
                                key={index}
                                className={`mb-4 p-3 rounded-lg ${transcript.isFinal ? 'bg-gray-50' : 'bg-yellow-50'
                                    }`}
                            >
                                <div className="font-bold text-blue-600">{transcript.speaker}:</div>
                                <div>{transcript.text}</div>
                                {transcript.analysis && transcript.isFinal && (
                                    <div className="mt-2 text-sm text-gray-600">
                                        <div>
                                            <strong>Summary:</strong> {transcript.analysis.summary}
                                        </div>
                                        <div>
                                            <strong>Semantics:</strong> {transcript.analysis.semantics}
                                        </div>
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
