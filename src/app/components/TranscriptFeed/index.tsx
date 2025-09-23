import { TranscriptTurn } from "@/hooks/useTranscript";
import React from "react";


type TranscriptFeedProps = {
    transcripts: TranscriptTurn[];
};



export default function TranscriptFeed({ transcripts }: TranscriptFeedProps) {
    return (
        <div className="space-y-4 h-[60vh] overflow-y-auto p-4 border rounded-md bg-gray-50">
            {transcripts.length === 0 ? (
                <p className="text-gray-500">No transcript available yet. Start speaking to see it here.</p>
            ) : (
                transcripts.map((turn, index) => (
                    <div key={index} className="bg-white p-3 rounded-lg shadow-sm">
                        <p className="font-semibold text-blue-600">{turn.speaker_name}:</p>
                        <p className="text-gray-800">{turn.text}</p>
                    </div>
                ))
            )}
        </div>
    );
}