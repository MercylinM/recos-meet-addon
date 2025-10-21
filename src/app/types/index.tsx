
export interface GeminiAnalysis {
    summary: string;
    semantics: string;
    questions: string[];
    confidence?: number;
    keywords?: string[];
}

export interface Transcript {
    speaker: string;
    text: string;
    analysis?: {
        summary?: string;
        semantics?: string;
        questions?: string[];
        confidence?: number;
        keywords?: string[];
        answer_quality?: string;
        detected_question?: string;
    };
    timestamp: number;
    isFinal: boolean;
    messageType?: string;
    segmentLength?: number;
    analysisTimestamp?: number;
    question?: string;
    interview_id?: number;
}

export interface AudioMetrics {
    bytesTransmitted: number;
    packetsLost: number;
    averageLatency: number;
    connectionTime: number;
    bytesReceived?: number;
    lastAckTime?: number;
}

export interface WebSocketStatus {
    audioConnected: boolean;
    transcriptConnected: boolean;
    lastMessageTime: number;
    reconnectAttempts: number;
}

export interface MeetingSession {
    meetingId: string;
    participants: Array<{
        id?: string;
        name?: string;
        email?: string;
    }>;
    sessionId: string;
    startTime: string;
    endTime?: string;
}



