import { GeminiAnalysis } from "@/app/types";

interface AnalysisDisplayProps {
    analysis: GeminiAnalysis;
}

export const AnalysisDisplay = ({ analysis }: AnalysisDisplayProps) => (
    <div className="mt-3 p-3 rounded-md bg-[#803ceb]/20 border border-[#803ceb]/40 text-sm">
        <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-[#a855f7]">AI Insight</h4>
            {analysis.confidence && (
                <span className="text-xs bg-white/10 px-2 py-1 rounded-full">
                    Confidence: {(analysis.confidence * 100).toFixed(0)}%
                </span>
            )}
        </div>
        <p className="text-white/90 mb-2">
            <span className="font-semibold text-white">Summary:</span> {analysis.summary}
        </p>
        <p className="text-white/90 mb-2">
            <span className="font-semibold text-white">Semantics:</span> {analysis.semantics}
        </p>
        {analysis.keywords && analysis.keywords.length > 0 && (
            <div className="mb-2">
                <span className="font-semibold text-white">Keywords:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                    {analysis.keywords.map((keyword, index) => (
                        <span key={index} className="bg-[#803ceb]/30 px-2 py-1 rounded-full text-xs">
                            {keyword}
                        </span>
                    ))}
                </div>
            </div>
        )}
        {analysis.questions && analysis.questions.length > 0 && (
            <div>
                <span className="font-semibold text-white">Suggested Questions:</span>
                <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                    {analysis.questions.map((q, index) => (
                        <li key={index} className="text-white/80">{q}</li>
                    ))}
                </ul>
            </div>
        )}
    </div>
);