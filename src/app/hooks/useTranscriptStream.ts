// import { useEffect, useRef, useState, useCallback } from 'react';

// const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://add-on-backend.onrender.com';
// const WS_URL = BACKEND_URL.replace('http', 'ws');

// interface TranscriptData {
//     message_type: string;
//     transcript: string;
//     speaker_name: string;
//     speaker_tag: string;
//     timestamp: number;
//     is_final: boolean;
//     end_of_turn: boolean;
//     analysis?: {
//         summary?: string;
//         semantics?: string;
//         questions?: string[];
//         confidence?: number;
//         keywords?: string[];
//     };
// }

// interface UseTranscriptStreamReturn {
//     isConnected: boolean;
//     connectionStatus: string;
//     lastMessageTime: number;
//     reconnectAttempts: number;
//     bytesReceived: number;
//     connect: () => void;
//     disconnect: () => void;
//     transcripts: TranscriptData[];
//     clearTranscripts: () => void;
// }

// export function useTranscriptStream(
//     onTranscriptReceived?: (data: TranscriptData) => void
// ): UseTranscriptStreamReturn {
//     const [isConnected, setIsConnected] = useState(false);
//     const [connectionStatus, setConnectionStatus] = useState('Disconnected');
//     const [lastMessageTime, setLastMessageTime] = useState(0);
//     const [reconnectAttempts, setReconnectAttempts] = useState(0);
//     const [bytesReceived, setBytesReceived] = useState(0);
//     const [transcripts, setTranscripts] = useState<TranscriptData[]>([]);

//     const wsRef = useRef<WebSocket | null>(null);
//     const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
//     const shouldReconnectRef = useRef(false);

//     const connect = useCallback(() => {
//         if (wsRef.current?.readyState === WebSocket.OPEN) {
//             console.log('WebSocket already connected');
//             return;
//         }

//         shouldReconnectRef.current = true;
//         setConnectionStatus('Connecting...');

//         try {
//             const wsUrl = `${WS_URL}/ws/audio`;
//             console.log('Connecting to WebSocket:', wsUrl);

//             const ws = new WebSocket(wsUrl);

//             ws.onopen = () => {
//                 console.log('Transcript WebSocket connected');
//                 setIsConnected(true);
//                 setConnectionStatus('Connected');
//                 setReconnectAttempts(0);
//             };

//             ws.onmessage = (event) => {
//                 try {
//                     const data = JSON.parse(event.data) as TranscriptData;
//                     const now = Date.now();

//                     setLastMessageTime(now);
//                     setBytesReceived(prev => prev + event.data.length);

//                     setTranscripts(prev => [...prev, data]);

//                     if (onTranscriptReceived) {
//                         onTranscriptReceived(data);
//                     }

//                     console.log('Received transcript:', {
//                         type: data.message_type,
//                         speaker: data.speaker_name,
//                         transcript: data.transcript.substring(0, 50) + '...',
//                         timestamp: new Date(data.timestamp).toLocaleTimeString()
//                     });

//                 } catch (error) {
//                     console.error('Failed to parse transcript message:', error, event.data);
//                 }
//             };

//             ws.onerror = (error) => {
//                 console.error('Transcript WebSocket error:', error);
//                 setConnectionStatus('Connection error');
//             };

//             ws.onclose = (event) => {
//                 console.log('🔌 Transcript WebSocket closed:', event.code, event.reason);
//                 setIsConnected(false);
//                 setConnectionStatus(`Disconnected (${event.code})`);
//                 wsRef.current = null;

//                 if (shouldReconnectRef.current && event.code !== 1000) {
//                     const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
//                     console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts + 1})`);
//                     setConnectionStatus(`Reconnecting in ${Math.round(delay / 1000)}s...`);

//                     reconnectTimeoutRef.current = setTimeout(() => {
//                         setReconnectAttempts(prev => prev + 1);
//                         connect();
//                     }, delay);
//                 }
//             };

//             wsRef.current = ws;
//         } catch (error) {
//             console.error('Failed to create WebSocket:', error);
//             setConnectionStatus('Failed to connect');
//             setIsConnected(false);
//         }
//     }, [reconnectAttempts, onTranscriptReceived]);

//     const disconnect = useCallback(() => {
//         console.log('Disconnecting WebSocket...');
//         shouldReconnectRef.current = false;

//         if (reconnectTimeoutRef.current) {
//             clearTimeout(reconnectTimeoutRef.current);
//             reconnectTimeoutRef.current = null;
//         }

//         if (wsRef.current) {
//             wsRef.current.close(1000, 'Manual disconnect');
//             wsRef.current = null;
//         }

//         setIsConnected(false);
//         setConnectionStatus('Disconnected');
//         setReconnectAttempts(0);
//     }, []);

//     const clearTranscripts = useCallback(() => {
//         setTranscripts([]);
//     }, []);

//     useEffect(() => {
//         return () => {
//             disconnect();
//         };
//     }, [disconnect]);

//     return {
//         isConnected,
//         connectionStatus,
//         lastMessageTime,
//         reconnectAttempts,
//         bytesReceived,
//         connect,
//         disconnect,
//         transcripts,
//         clearTranscripts,
//     };
// }

import { useEffect, useRef, useState, useCallback } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://add-on-backend.onrender.com';
const WS_URL = BACKEND_URL.replace('http', 'ws');

interface TranscriptData {
    message_type: string;
    transcript: string;
    speaker_name: string;
    speaker_tag: string;
    timestamp: number;
    is_final: boolean;
    end_of_turn: boolean;
    analysis?: {
        detected_question?: string;
        candidate_answer_summary?: string;
        semantics?: string;
        questions?: string[];
        confidence?: number;
        keywords?: string[];
        answer_quality?: string;
    };
}

interface UseTranscriptStreamReturn {
    isConnected: boolean;
    connectionStatus: string;
    lastMessageTime: number;
    reconnectAttempts: number;
    bytesReceived: number;
    connect: () => void;
    disconnect: () => void;
    transcripts: TranscriptData[];
    clearTranscripts: () => void;
}

export function useTranscriptStream(
    onTranscriptReceived?: (data: TranscriptData) => void
): UseTranscriptStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [lastMessageTime, setLastMessageTime] = useState(0);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const [bytesReceived, setBytesReceived] = useState(0);
    const [transcripts, setTranscripts] = useState<TranscriptData[]>([]);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const shouldReconnectRef = useRef(false);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected');
            return;
        }

        shouldReconnectRef.current = true;
        setConnectionStatus('Connecting...');

        try {
            const wsUrl = `${WS_URL}/ws/audio`;
            console.log('Connecting to WebSocket:', wsUrl);

            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('Transcript WebSocket connected');
                setIsConnected(true);
                setConnectionStatus('Connected');
                setReconnectAttempts(0);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as TranscriptData;
                    const now = Date.now();

                    setLastMessageTime(now);
                    setBytesReceived(prev => prev + event.data.length);

                    setTranscripts(prev => [...prev, data]);

                    if (onTranscriptReceived) {
                        onTranscriptReceived(data);
                    }

                    // Enhanced logging to see analysis data
                    if (data.analysis) {
                        console.log('🎯 ANALYSIS RECEIVED in hook:', {
                            type: data.message_type,
                            speaker: data.speaker_name,
                            transcript_length: data.transcript?.length,
                            has_analysis: true,
                            detected_question: data.analysis.detected_question,
                            answer_summary: data.analysis.candidate_answer_summary?.substring(0, 50) + '...',
                            confidence: data.analysis.confidence
                        });
                    } else {
                        console.log('💬 Regular transcript:', {
                            type: data.message_type,
                            speaker: data.speaker_name,
                            transcript: data.transcript.substring(0, 50) + '...',
                            timestamp: new Date(data.timestamp).toLocaleTimeString()
                        });
                    }

                } catch (error) {
                    console.error('Failed to parse transcript message:', error, event.data);
                }
            };

            ws.onerror = (error) => {
                console.error('Transcript WebSocket error:', error);
                setConnectionStatus('Connection error');
            };

            ws.onclose = (event) => {
                console.log('🔌 Transcript WebSocket closed:', event.code, event.reason);
                setIsConnected(false);
                setConnectionStatus(`Disconnected (${event.code})`);
                wsRef.current = null;

                if (shouldReconnectRef.current && event.code !== 1000) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                    console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts + 1})`);
                    setConnectionStatus(`Reconnecting in ${Math.round(delay / 1000)}s...`);

                    reconnectTimeoutRef.current = setTimeout(() => {
                        setReconnectAttempts(prev => prev + 1);
                        connect();
                    }, delay);
                }
            };

            wsRef.current = ws;
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            setConnectionStatus('Failed to connect');
            setIsConnected(false);
        }
    }, [reconnectAttempts, onTranscriptReceived]);

    const disconnect = useCallback(() => {
        console.log('Disconnecting WebSocket...');
        shouldReconnectRef.current = false;

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (wsRef.current) {
            wsRef.current.close(1000, 'Manual disconnect');
            wsRef.current = null;
        }

        setIsConnected(false);
        setConnectionStatus('Disconnected');
        setReconnectAttempts(0);
    }, []);

    const clearTranscripts = useCallback(() => {
        setTranscripts([]);
    }, []);

    useEffect(() => {
        return () => {
            disconnect();
        };
    }, [disconnect]);

    return {
        isConnected,
        connectionStatus,
        lastMessageTime,
        reconnectAttempts,
        bytesReceived,
        connect,
        disconnect,
        transcripts,
        clearTranscripts,
    };
}