"use client";

import { useTranscript } from "@/hooks/useTranscript";
import TranscriptFeed from "../components/TranscriptFeed";
import SemanticPanel from "../components/SemanticPanel";
import QuestionList from "../components/QuestionList";

export default function RecruiterDashboard() {
    const { transcripts, status } = useTranscript();

    return (
        <main className="grid grid-cols-3 gap-4 p-6">
            <section className="col-span-2 space-y-4">
                <h1 className="text-2xl font-bold">Live Transcript</h1>
                <p className="text-sm text-gray-500">Status: {status}</p>
                <TranscriptFeed transcripts={transcripts} />

                <SemanticPanel transcripts={transcripts} />
                <QuestionList transcripts={transcripts} />
            </section>
        </main>
    );
}
