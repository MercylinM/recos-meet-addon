// components/TranscriptEntry.tsx

import { Transcript } from "@/app/types";

interface TranscriptEntryProps {
    transcript: Transcript;
    showSpeaker?: boolean;
}

export function TranscriptEntry({ transcript, showSpeaker = false }: TranscriptEntryProps) {
    const isAnalysis = transcript.messageType === 'analysis';
    const analysis = transcript.analysis;

    if (isAnalysis) {
        return (
            <div className="p-4 rounded-lg border border-green-500/30 bg-green-900/20">
                {/* Question */}
                {transcript.question && (
                    <div className="mb-3 p-3 bg-blue-900/30 rounded border border-blue-500/30">
                        <div className="text-sm text-blue-300 font-medium mb-1">Interview Question</div>
                        <div className="text-white">{transcript.question}</div>
                    </div>
                )}

                {/* Candidate Answer */}
                {/* <div className="mb-4 p-3 bg-gray-800/30 rounded border border-gray-500/30">
                    <div className="text-sm text-gray-300 font-medium mb-1">💬Candidate Answer</div>
                    <div className="text-white">{transcript.text}</div>
                </div> */}

                {/* AI Analysis */}
                {analysis && (
                    <div className="p-3 bg-green-900/30 rounded border border-green-500/30">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            <span className="text-green-300 font-medium">AI Analysis</span>
                            {/* Safe confidence check */}
                            {analysis.confidence && analysis.confidence > 0 && (
                                <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">
                                    {Math.round(analysis.confidence * 100)}% confidence
                                </span>
                            )}
                        </div>

                        {/* Summary */}
                        {analysis.summary && analysis.summary !== 'No summary available' && (
                            <div className="mb-3">
                                <div className="text-sm text-green-300 font-medium mb-1">Summary</div>
                                <div className="text-white text-sm">{analysis.summary}</div>
                            </div>
                        )}

                        {/* Key Points */}
                        {analysis.keywords && analysis.keywords.length > 0 && (
                            <div className="mb-3">
                                <div className="text-sm text-green-300 font-medium mb-1">Key Points</div>
                                <div className="flex flex-wrap gap-1">
                                    {analysis.keywords.map((keyword, index) => (
                                        <span
                                            key={index}
                                            className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded"
                                        >
                                            {keyword}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Follow-up Questions */}
                        {analysis.questions && analysis.questions.length > 0 && (
                            <div>
                                <div className="text-sm text-green-300 font-medium mb-1">Suggested Follow-ups</div>
                                <ul className="text-white text-sm space-y-1">
                                    {analysis.questions.map((question, index) => (
                                        <li key={index} className="flex items-start gap-2">
                                            <span className="text-green-400 mt-1 flex-shrink-0">•</span>
                                            <span>{question}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Semantic Analysis */}
                        {analysis.semantics && analysis.semantics !== 'No semantic analysis' && (
                            <div className="mt-3 pt-3 border-t border-green-500/20">
                                <div className="text-sm text-green-300 font-medium mb-1">Skills & Alignment</div>
                                <div className="text-white text-sm">{analysis.semantics}</div>
                            </div>
                        )}

                        {/* Answer Quality */}
                        {analysis.answer_quality && analysis.answer_quality !== 'unknown' && (
                            <div className="mt-3 pt-3 border-t border-green-500/20">
                                <div className="text-sm text-green-300 font-medium mb-1">Answer Quality</div>
                                <div className={`text-sm font-medium ${analysis.answer_quality === 'excellent' ? 'text-green-400' :
                                        analysis.answer_quality === 'good' ? 'text-blue-400' :
                                            analysis.answer_quality === 'fair' ? 'text-yellow-400' :
                                                'text-red-400'
                                    }`}>
                                    {analysis.answer_quality.charAt(0).toUpperCase() + analysis.answer_quality.slice(1)}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-900/20">
            <div className="text-white">{transcript.text}</div>
            <div className="text-xs text-white/40 mt-1">
                {new Date(transcript.timestamp).toLocaleTimeString()}
            </div>
        </div>
    );
}