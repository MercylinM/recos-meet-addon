/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react';
import { Transcript } from '../types';

export const useTranscripts = () => {
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    const [wsStatus, setWsStatus] = useState({
        transcriptConnected: false,
        lastMessageTime: 0,
        reconnectAttempts: 0
    });

    const handleTranscriptReceived = useCallback((data: any) => {
        setWsStatus(prev => ({
            ...prev,
            lastMessageTime: Date.now(),
            transcriptConnected: true
        }));

        const newTranscript: Transcript = {
            speaker: data.speaker_name || 'Unknown Speaker',
            text: data.transcript,
            analysis: data.analysis,
            timestamp: data.timestamp || Date.now(),
            isFinal: data.is_final || false,
            messageType: data.message_type,
            segmentLength: data.transcript?.length,
            analysisTimestamp: data.analysis_timestamp
        };

        setTranscripts((prev) => {
            if (data.message_type === 'interim_transcript') {
                const otherTranscripts = prev.filter(t =>
                    !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
                );
                return [newTranscript, ...otherTranscripts];
            }

            if (data.message_type === 'final_transcript' || data.message_type === 'enriched_transcript') {
                const otherTranscripts = prev.filter(t =>
                    !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
                );
                return [newTranscript, ...otherTranscripts];
            }

            return [newTranscript, ...prev];
        });
    }, []);

    const clearTranscripts = useCallback(() => {
        setTranscripts([]);
    }, []);

    return {
        transcripts,
        wsStatus,
        setWsStatus,
        handleTranscriptReceived,
        clearTranscripts
    };
};