type Transcript = {
    analysis: {
        summary: string;
        semantics: string;
    };
};

export default function SemanticPanel({ transcripts }: { transcripts: Transcript[] }) {
    const latest = transcripts[transcripts.length - 1]?.analysis;

    if (!latest) return null;

    return (
        <div className="p-4 border rounded-lg bg-white shadow">
            <h2 className="font-bold mb-2">Semantic Analysis</h2>
            <p className="mb-1"><span className="font-semibold">Summary:</span> {latest.summary}</p>
            <p><span className="font-semibold">Semantics:</span> {latest.semantics}</p>
        </div>
    );
}
