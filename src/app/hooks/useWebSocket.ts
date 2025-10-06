/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback } from 'react';
import { BACKEND_URL } from '../utils/constants';

export const useWebSocket = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessageTime, setLastMessageTime] = useState(0);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;

    const connect = useCallback((onMessage: (data: any) => void) => {
        try {
            const wsUrl = BACKEND_URL.replace(/^http/, 'ws') + '/ws/transcript';
            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                setIsConnected(true);
                reconnectAttemptsRef.current = 0;
                console.log('[WebSocket] Connected to transcript stream');
            };

            wsRef.current.onmessage = (event) => {
                setLastMessageTime(Date.now());
                try {
                    const data = JSON.parse(event.data);
                    onMessage(data);
                } catch (error) {
                    console.error('[WebSocket] Failed to parse message:', error);
                }
            };

            wsRef.current.onclose = (event) => {
                setIsConnected(false);
                console.log(`[WebSocket] Closed: ${event.code} - ${event.reason}`);

                if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                    setTimeout(() => {
                        reconnectAttemptsRef.current++;
                        connect(onMessage);
                    }, 1000 * reconnectAttemptsRef.current);
                }
            };

            wsRef.current.onerror = (error) => {
                console.error('[WebSocket] Error:', error);
            };

        } catch (error) {
            console.error('[WebSocket] Failed to create connection:', error);
        }
    }, []);

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setIsConnected(false);
    }, []);

    return {
        isConnected,
        lastMessageTime,
        connect,
        disconnect
    };
};