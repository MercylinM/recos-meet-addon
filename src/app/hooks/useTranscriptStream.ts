import { useEffect, useRef, useState, useCallback } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://add-on-backend.onrender.com';
const WS_URL = BACKEND_URL.replace('http', 'ws');

interface TranscriptData {
    message_type: string;
    transcript: string;
    speaker_name: string;
    timestamp: number;
    is_final: boolean;
    analysis?: {
        summary?: string;
        keywords?: string[];
        questions?: string[];
    };
    analysis_timestamp?: number;
}

interface UseTranscriptStreamReturn {
    isConnected: boolean;
    connectionStatus: string;
    lastMessageTime: number;
    reconnectAttempts: number;
    bytesReceived: number;
    connect: () => void;
    disconnect: () => void;
}

export function useTranscriptStream(
    onTranscriptReceived: (data: TranscriptData) => void
): UseTranscriptStreamReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('Disconnected');
    const [lastMessageTime, setLastMessageTime] = useState(0);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const [bytesReceived, setBytesReceived] = useState(0);

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
            const ws = new WebSocket(`${WS_URL}/ws/transcripts`);

            ws.onopen = () => {
                console.log('Transcript WebSocket connected');
                setIsConnected(true);
                setConnectionStatus('Connected');
                setReconnectAttempts(0);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as TranscriptData;
                    setLastMessageTime(Date.now());
                    setBytesReceived(prev => prev + event.data.length);
                    onTranscriptReceived(data);
                } catch (error) {
                    console.error('Failed to parse transcript message:', error);
                }
            };

            ws.onerror = (error) => {
                console.error('Transcript WebSocket error:', error);
                setConnectionStatus('Connection error');
            };

            ws.onclose = () => {
                console.log('Transcript WebSocket closed');
                setIsConnected(false);
                setConnectionStatus('Disconnected');
                wsRef.current = null;

                if (shouldReconnectRef.current) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                    console.log(`Reconnecting in ${delay}ms...`);
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
        shouldReconnectRef.current = false;

        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        setIsConnected(false);
        setConnectionStatus('Disconnected');
        setReconnectAttempts(0);
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
    };
}