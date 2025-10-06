import { Transcript } from "@/app/types";
import { AnalysisDisplay } from "../AnalysisDisplay";


interface TranscriptEntryProps {
    transcript: Transcript;
}

export const TranscriptEntry = ({ transcript }: TranscriptEntryProps) => {
    const isFinal = transcript.isFinal;
    const isAnalyzed = !!transcript.analysis;
    const isInterim = transcript.messageType === 'interim_transcript';
    const isError = transcript.messageType === 'analysis_error';

    return (
        <div className={`p-3 rounded-lg mb-3 ${isError ? 'bg-red-500/10 border-l-4 border-l-red-500' :
                isInterim ? 'bg-transparent border-l-2 border-l-yellow-500/40 animate-pulse-slow' :
                    isFinal ? 'bg-[#1a1458]/70 border-l-4 border-l-emerald-500/80' :
                        'bg-transparent border-l-2 border-l-[#803ceb]/40'
            }`}>
            <div className={`font-semibold text-sm ${isError ? 'text-red-400' :
                    isInterim ? 'text-yellow-400' :
                        isFinal ? 'text-emerald-400' : 'text-[#803ceb]'
                } mb-1`}>
                {transcript.speaker}
                <span className="text-xs text-white/50 ml-2">
                    ({new Date(transcript.timestamp).toLocaleTimeString()})
                    {transcript.segmentLength && ` • ${transcript.segmentLength} chars`}
                </span>
            </div>
            <p className={`text-white/90 ${isInterim ? 'italic text-white/70' : ''}`}>
                {transcript.text}
                {isFinal && isAnalyzed && ' (Analyzed)'}
                {isError && ' (Analysis Failed)'}
                {isInterim && ' (Listening...)'}
            </p>

            {transcript.analysis && (
                <AnalysisDisplay analysis={transcript.analysis} />
            )}
        </div>
    );
};