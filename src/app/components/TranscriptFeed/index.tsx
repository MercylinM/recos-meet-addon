type Transcript = {
    text: string;
    speaker_name: string;
};

export default function TranscriptFeed({ transcripts }: { transcripts: Transcript[] }) {
    return (
        <div className="p-4 border rounded-lg h-[70vh] overflow-y-auto bg-white shadow">
            {transcripts.map((t, i) => (
                <p key={i} className="mb-2">
                    <span className="font-semibold">{t.speaker_name}: </span>
                    {t.text}
                </p>
            ))}
        </div>
    );
}
