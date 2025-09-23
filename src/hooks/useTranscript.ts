"use client"; 

import { useEffect, useState } from "react";

type Analysis = {
    summary: string;
    semantics: string;
    questions: string[];
};

type EnrichedTranscript = {
    text: string;
    speaker_name: string;
    analysis: Analysis;
};

const defaultWsUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "ws://localhost:3000";

export function useTranscript(wsUrl: string = defaultWsUrl + "/ws/audio") {
    const [transcripts, setTranscripts] = useState<EnrichedTranscript[]>([]);
    const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");

    useEffect(() => {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setStatus("open");
            console.log("[useTranscript] Connected to WebSocket");
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.message_type === "enriched_transcript") {
                    setTranscripts((prev) => [...prev, data]);
                }
            } catch (e) {
                console.error("[useTranscript] WS parse error:", e);
            }
        };

        ws.onerror = (err) => {
            console.error("[useTranscript] WS error:", err);
            setStatus("error");
        };

        ws.onclose = () => {
            setStatus("closed");
            console.warn("[useTranscript] WebSocket closed");
        };

        return () => {
            ws.close();
        };
    }, [wsUrl]);

    return { transcripts, status };
}