/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback } from 'react';
import { RealTimeAudioCapture } from '../utils/audioCapture';
import { BACKEND_URL } from '../utils/constants';
import { AudioMetrics } from '../types';

export const useAudioCapture = () => {
    const [isCapturing, setIsCapturing] = useState(false);
    const [hasPermissions, setHasPermissions] = useState(false);
    const [status, setStatus] = useState('Initializing audio capture...');
    const [audioMetrics, setAudioMetrics] = useState<AudioMetrics>({
        bytesTransmitted: 0,
        packetsLost: 0,
        averageLatency: 0,
        connectionTime: 0,
        bytesReceived: 0,
        lastAckTime: 0
    });
    const [audioLevel, setAudioLevel] = useState(0);

    const audioCapture = useRef<RealTimeAudioCapture | null>(null);

    const initializeAudioCapture = useCallback((onTranscriptReceived: (data: any) => void) => {
        audioCapture.current = new RealTimeAudioCapture(
            BACKEND_URL,
            setStatus,
            setAudioMetrics,
            onTranscriptReceived
        );
    }, []);

    const requestPermissions = async (): Promise<boolean> => {
        if (!audioCapture.current) return false;

        const granted = await audioCapture.current.requestPermissions();
        setHasPermissions(granted);
        if (granted) {
            setStatus('Permissions granted - Ready to start analysis');
        }
        return granted;
    };

    const startCapture = async (): Promise<boolean> => {
        if (!audioCapture.current) return false;

        const started = await audioCapture.current.startCapture();
        if (started) {
            setIsCapturing(true);
        }
        return started;
    };

    const stopCapture = async (): Promise<void> => {
        if (!audioCapture.current) return;

        await audioCapture.current.stopCapture();
        setIsCapturing(false);
        setStatus('Analysis stopped - Ready to start again');
    };

    const getAudioLevel = (): number => {
        return audioCapture.current?.getAudioLevel() || 0;
    };

    return {
        isCapturing,
        hasPermissions,
        status,
        audioMetrics,
        audioLevel,
        initializeAudioCapture,
        requestPermissions,
        startCapture,
        stopCapture,
        getAudioLevel
    };
};