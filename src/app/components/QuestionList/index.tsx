type Transcript = {
    analysis: {
        questions: string[];
    };
};

export default function QuestionList({ transcripts }: { transcripts: Transcript[] }) {
    const latest = transcripts[transcripts.length - 1]?.analysis;

    if (!latest || latest.questions.length === 0) return null;

    return (
        <div className="p-4 border rounded-lg bg-white shadow">
            <h2 className="font-bold mb-2">Suggested Questions</h2>
            <ul className="list-disc list-inside space-y-1">
                {latest.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                ))}
            </ul>
        </div>
    );
}

