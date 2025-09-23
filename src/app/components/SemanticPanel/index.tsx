import React from "react";

type EnrichedTranscript = {
    text: string;
    speaker_name: string;
    analysis: {
        summary: string;
        semantics: string;
        questions: string[];
    };
};

type SemanticPanelProps = {
    transcripts: EnrichedTranscript[];
};

export default function SemanticPanel({ transcripts }: SemanticPanelProps) {
    const enrichedTranscripts = transcripts.filter(t => t.analysis);

    return (
        <div className="space-y-4 p-4 border rounded-md bg-gray-50">
            <h2 className="text-xl font-bold">Semantic Analysis</h2>
            {enrichedTranscripts.length === 0 ? (
                <p className="text-gray-500">Analysis will appear here after a full conversation turn is completed.</p>
            ) : (
                enrichedTranscripts.map((turn, index) => (
                    <div key={index} className="bg-white p-3 rounded-lg shadow-sm">
                        <h3 className="font-semibold text-sm text-gray-700">{turn.speaker_name}&apos;s Analysis:</h3>
                        <div className="text-gray-800 text-sm mt-1">
                            {turn.analysis.summary && (
                                <p className="mt-1">
                                    <span className="font-bold">Summary:</span> {turn.analysis.summary}
                                </p>
                            )}
                            {turn.analysis.semantics && (
                                <p className="mt-1">
                                    <span className="font-bold">Semantics:</span> {turn.analysis.semantics}
                                </p>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}