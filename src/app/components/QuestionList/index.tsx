import React from "react";

type EnrichedTranscript = {
    text: string;
    speaker_name: string;
    analysis: {
        questions: string[];
    };
};

type QuestionListProps = {
    transcripts: EnrichedTranscript[];
};

export default function QuestionList({ transcripts }: QuestionListProps) {
    const allQuestions = transcripts.flatMap(t => (t.analysis?.questions || []));

    return (
        <div className="space-y-4 p-4 border rounded-md bg-gray-50">
            <h2 className="text-xl font-bold">Identified Questions</h2>
            {allQuestions.length === 0 ? (
                <p className="text-gray-500">Questions will be listed here as they are asked.</p>
            ) : (
                <ul className="list-disc list-inside space-y-2">
                    {allQuestions.map((question, index) => (
                        <li key={index} className="text-gray-800">{question}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}