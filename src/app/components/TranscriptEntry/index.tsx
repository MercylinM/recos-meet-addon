// components/TranscriptEntry.tsx

import { Transcript } from "@/app/types";

interface TranscriptEntryProps {
    transcript: Transcript;
    showSpeaker?: boolean;
}

export function TranscriptEntry({ transcript, showSpeaker = true }: TranscriptEntryProps) {
    const isAnalysis = transcript.messageType === 'analysis';

    return (
        <div className={`p-4 rounded-lg border ${isAnalysis
                ? 'bg-green-900/20 border-green-500/30'
                : transcript.isFinal
                    ? 'bg-blue-900/20 border-blue-500/30'
                    : 'bg-gray-800/20 border-gray-500/30'
            }`}>
            {showSpeaker && transcript.speaker && (
                <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${isAnalysis ? 'bg-green-500' : 'bg-blue-500'
                        }`} />
                    <span className="text-sm font-medium text-white/70">
                        {transcript.speaker}
                    </span>
                    {isAnalysis && (
                        <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">
                            AI Analysis
                        </span>
                    )}
                </div>
            )}

            {transcript.question && (
                <div className="mb-2 p-3 bg-blue-900/30 rounded border border-blue-500/30">
                    <div className="text-sm text-blue-300 font-medium mb-1">Interview Question:</div>
                    <div className="text-white">{transcript.question}</div>
                </div>
            )}

            <div className="text-white mb-3">
                {transcript.text}
            </div>

            {transcript.analysis && (
                <div className="mt-3 p-3 bg-green-900/20 rounded border border-green-500/30">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm font-medium text-green-300">AI Analysis</span>
                        {transcript.analysis?.confidence && transcript.analysis.confidence  > 0 && (
                            <span className="text-xs bg-green-500/20 text-green-300 px-2 py-1 rounded">
                                {Math.round(transcript.analysis.confidence * 100)}% confidence
                            </span>
                        )}
                    </div>

                    {transcript.analysis.summary && (
                        <div className="mb-2">
                            <div className="text-sm text-green-300 font-medium mb-1">Summary:</div>
                            <div className="text-white text-sm">{transcript.analysis.summary}</div>
                        </div>
                    )}

                    {transcript.analysis.keywords && transcript.analysis.keywords.length > 0 && (
                        <div className="mb-2">
                            <div className="text-sm text-green-300 font-medium mb-1">Key Points:</div>
                            <div className="flex flex-wrap gap-1">
                                {transcript.analysis.keywords.map((keyword, index) => (
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

                    {transcript.analysis.questions && transcript.analysis.questions.length > 0 && (
                        <div>
                            <div className="text-sm text-green-300 font-medium mb-1">Suggested Follow-ups:</div>
                            <ul className="text-white text-sm space-y-1">
                                {transcript.analysis.questions.map((question, index) => (
                                    <li key={index} className="flex items-start gap-2">
                                        <span className="text-green-400 mt-1">•</span>
                                        <span>{question}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {transcript.analysis.answer_quality && transcript.analysis.answer_quality !== "unknown" && (
                        <div className="mt-2">
                            <div className="text-sm text-green-300 font-medium mb-1">Answer Quality:</div>
                            <div className={`text-sm font-medium ${transcript.analysis.answer_quality === 'excellent' ? 'text-green-400' :
                                    transcript.analysis.answer_quality === 'good' ? 'text-blue-400' :
                                        transcript.analysis.answer_quality === 'fair' ? 'text-yellow-400' :
                                            'text-red-400'
                                }`}>
                                {transcript.analysis.answer_quality.charAt(0).toUpperCase() + transcript.analysis.answer_quality.slice(1)}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="text-xs text-white/40 mt-2">
                {new Date(transcript.timestamp).toLocaleTimeString()}
                {transcript.messageType && ` • ${transcript.messageType}`}
            </div>
        </div>
    );
}