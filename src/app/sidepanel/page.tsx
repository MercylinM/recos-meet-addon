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
            <div className="text-xs text-[#803ceb] font-medium uppercase tracking-wide">Connection Status</div>
            <div className="text-white/90 text-sm">{status}</div>
        </div>
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
    const [isConnected, setIsConnected] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [status, setStatus] = useState('Initializing networks...');
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
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://recos-add-on-backend.onrender.com';

    useEffect(() => {
        const initializeAddon = async () => {
            try {
                const session = await meet.addon.createAddonSession({
                    cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
                });
                const client = await session.createSidePanelClient();
                setSidePanelClient(client);
                setStatus('Connected');

                client.on('frameToFrameMessage', (event) => {
                    console.log('Frame to frame message:', event);
                });
            } catch (error) {
                console.error('Error initializing addon:', error);
                setStatus('Connection initialization failed');
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
                    setStatus('Connection established');
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
                    setStatus('Disconnected');
                    wsPromiseRef.current = null;
                };

                wsRef.current.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    setStatus('Connection error');
                    wsRef.current?.close();
                    reject(error);
                };
            } catch (error) {
                console.error('Error connecting to backend:', error);
                setStatus('Failed to establish connection');
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
            setStatus('Streaming to audio processor');
        } catch (error) {
            console.error('Error starting stream:', error);
            setStatus(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const stopStreaming = () => {
        setIsStreaming(false);
        setStatus('Audio stream terminated');
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
                setStatus(`Audio processor activated (PID: ${data.pid})`);
                setTimeout(() => fetchSoxStatus(), 2000);
            } else {
                setStatus(`Failed to activate processor: ${data.message}`);
            }
        } catch (error) {
            console.error('Error starting SoxClient:', error);
            setStatus(`Processor activation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
                setStatus('Audio processor deactivated');
                fetchSoxStatus();
            } else {
                setStatus(`Failed to deactivate processor: ${data.message}`);
            }
        } catch (error) {
            console.error('Error stopping SoxClient:', error);
            setStatus(`Processor deactivation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            setStatus(`Meeting Details: ${meetingInfo.meetingId || 'Unknown'}`);
        } catch (error) {
            console.error('Error getting meeting info:', error);
            setStatus('Failed to access meeting Details');
        }
    };

    const formatStartTime = (startTime: string | null) => {
        if (!startTime) return 'N/A';
        const date = new Date(startTime);
        return date.toLocaleTimeString();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141244] to-[#1a1458] text-white p-6">
            {/* Animated background elements */}
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
                        <AIOrb isActive={isStreaming} size="w-8 h-8" />
                    </div>
                    <p className="text-white/60 text-lg">Advanced AI-powered meeting transcription & analysis</p>
                </div>

                {/* Status Dashboard */}
                <div className="mb-8">
                    <StatusIndicator status={status} isConnected={isConnected} />
                </div>

                {/* System Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
                        <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Backend Link</div>
                        <div className="flex items-center gap-2">
                            <AIOrb isActive={isConnected} size="w-2 h-2" />
                            <span className="text-white/90">{isConnected ? 'Active' : 'Inactive'}</span>
                        </div>
                    </div>
                    <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
                        <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Data Stream</div>
                        <div className="flex items-center gap-2">
                            <AIOrb isActive={isStreaming} size="w-2 h-2" />
                            <span className="text-white/90">{isStreaming ? 'Streaming' : 'Standby'}</span>
                        </div>
                    </div>
                    <div className="bg-gradient-to-r from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md rounded-xl p-4 border border-[#803ceb]/20">
                        <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Audio Processor</div>
                        <div className="flex items-center gap-2">
                            <AIOrb isActive={soxStatus.running} size="w-2 h-2" />
                            <span className="text-white/90">{soxStatus.running ? 'Online' : 'Offline'}</span>
                        </div>
                    </div>
                </div>

                {/* Control Panel */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <Card title="Control Center" glowing={isConnected}>
                        <div className="space-y-4">
                            <div className="flex flex-wrap gap-3">
                                {!isStreaming ? (
                                    <Button onClick={startStreaming} variant="primary">
                                        Start Connection
                                    </Button>
                                ) : (
                                    <Button onClick={stopStreaming} variant="danger">
                                        End Connection
                                    </Button>
                                )}
                                <Button onClick={refreshStatus} variant="secondary">
                                    System Scan
                                </Button>
                            </div>
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

                    <Card title="Audio Processor Controls" glowing={soxStatus.running}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[#803ceb] mb-2">
                                    Audio Input Source
                                </label>
                                <select
                                    value={selectedDevice}
                                    onChange={(e) => setSelectedDevice(e.target.value)}
                                    className="w-full p-3 rounded-xl bg-[#141244]/60 border border-[#803ceb]/30 text-white focus:border-[#803ceb] focus:ring-2 focus:ring-[#803ceb]/20 transition-all"
                                    disabled={loading || soxStatus.running}
                                >
                                    {audioDevices.map((device) => (
                                        <option key={device.name} value={device.name} className="bg-[#141244]">
                                            {device.name} - {device.description}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                {!soxStatus.running ? (
                                    <Button
                                        onClick={startSoxClient}
                                        disabled={loading || !isConnected}
                                        loading={loading}
                                        variant="success"
                                        className="w-full"
                                    >
                                        {loading ? 'Initializing...' : 'Activate Processor'}
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={stopSoxClient}
                                        disabled={loading}
                                        loading={loading}
                                        variant="danger"
                                        className="w-full"
                                    >
                                        {loading ? 'Deactivating...' : 'Deactivate Processor'}
                                    </Button>
                                )}
                            </div>
                            {soxStatus.running && soxStatus.startTime && (
                                <div className="text-sm text-white/60">
                                    Sync initiated: {formatStartTime(soxStatus.startTime)}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>


                {/* Transcript Stream */}
                <Card title="Transcript Stream" glowing={transcripts.length > 0}>
                    <div className="h-96 overflow-y-auto space-y-4 pr-2">
                        {transcripts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-white/50">
                                <AIOrb isActive={false} size="w-12 h-12" />
                                <p className="mt-4 text-center">
                                    Audio stream inactive. Initialize connection to begin analysis.
                                </p>
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
                                        {!transcript.isFinal && (
                                            <span className="text-xs text-[#803ceb] bg-[#803ceb]/20 px-2 py-1 rounded-full">
                                                Processing
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-white/90 mb-3">{transcript.text}</p>
                                    {transcript.analysis && transcript.isFinal && (
                                        <div className="border-t border-[#803ceb]/20 pt-3 space-y-2">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Transcript Summary</div>
                                                    <p className="text-white/70 text-sm">{transcript.analysis.summary}</p>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-1">Semantic Analysis</div>
                                                    <p className="text-white/70 text-sm">{transcript.analysis.semantics}</p>
                                                </div>
                                            </div>
                                            {transcript.analysis.questions && transcript.analysis.questions.length > 0 && (
                                                <div>
                                                    <div className="text-xs text-[#803ceb] uppercase tracking-wide mb-2">Question Recommendations</div>
                                                    <div className="space-y-1">
                                                        {transcript.analysis.questions.map((q, i) => (
                                                            <div key={i} className="flex items-start gap-2">
                                                                <div className="w-1 h-1 bg-[#803ceb] rounded-full mt-2 flex-shrink-0"></div>
                                                                <span className="text-white/70 text-sm">{q}</span>
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
