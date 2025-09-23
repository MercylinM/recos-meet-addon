"use client"; 

import { useEffect, useState } from "react";

export type PartialTranscript = {
    text: string;
    speaker_name: string;
    end_of_turn: boolean;
    analysis: null;
    message_type: "PartialTranscript";
};

export type EnrichedTranscript = {
    text: string;
    speaker_name: string;
    end_of_turn: boolean;
    analysis: Analysis;
    message_type: "enriched_transcript";
};

export type TranscriptTurn = PartialTranscript | EnrichedTranscript;

type Analysis = {
    summary: string;
    semantics: string;
    questions: string[];
};



const defaultWsUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "ws://localhost:3000";

export function useTranscript(wsUrl: string = defaultWsUrl + "/ws/audio") {
    const [transcripts, setTranscripts] = useState<TranscriptTurn[]>([]);
    const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");

    useEffect(() => {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setStatus("open");
            console.log("[useTranscript] Connected to WebSocket");
        };

        // ws.onmessage = (event) => {
        //     try {
        //         const data = JSON.parse(event.data);

        //         console.log({data});
                

        //         if (data.message_type === "enriched_transcript") {
        //             setTranscripts((prev) => [...prev, data]);
        //         }
        //     } catch (e) {
        //         console.error("[useTranscript] WS parse error:", e);
        //     }
        // };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.message_type === "PartialTranscript") {
                    setTranscripts(prev => {
                        const lastTurn = prev[prev.length - 1];

                        if (lastTurn && lastTurn.message_type === "PartialTranscript") {
                            return prev.slice(0, -1).concat({
                                ...lastTurn,
                                text: data.text,
                            });
                        } else {
                            return prev.concat({
                                text: data.text,
                                speaker_name: "Speaker",
                                end_of_turn: false,
                                analysis: null, 
                                message_type: "PartialTranscript",
                            });
                        }
                    });
                }

                if (data.message_type === "enriched_transcript") {
                    setTranscripts(prev => {
                        const lastTurn = prev[prev.length - 1];

                        if (lastTurn && lastTurn.message_type === "PartialTranscript") {
                            return prev.slice(0, -1).concat(data);
                        } else {
                            return prev.concat(data);
                        }
                    });
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