// /* eslint-disable @typescript-eslint/no-explicit-any */
// "use client";

// import { useEffect, useState, useRef, useCallback } from 'react';
// import { BACKEND_URL } from '../utils/constants';
// import { AIOrb } from '../components/AIOrb';
// import { StatusIndicator } from '../components/StatusIndicator';
// import { formatBytes, formatDuration } from '../utils/formatters';
// import { Card } from '../components/Card';
// import { TranscriptEntry } from '../components/TranscriptEntry';
// import { MeetingSession, Transcript } from '../types';
// import { useTranscriptStream } from '../hooks/useTranscriptStream';
// import { meet } from '@googleworkspace/meet-addons/meet.addons';
// import { Button } from '../components/Button';

// interface AnalysisData {
//   detected_question?: string;
//   candidate_answer_summary?: string;
//   semantics?: string;
//   questions?: string[];
//   confidence?: number;
//   keywords?: string[];
//   answer_quality?: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
//   timestamp: number;
// }

// export default function SidePanel() {
//   const [addonSession, setAddonSession] = useState<any>(null);
//   const [sidePanelClient, setSidePanelClient] = useState<any>();
//   const [coDoingClient, setCoDoingClient] = useState<any>();
//   const [transcripts, setTranscripts] = useState<Transcript[]>([]);
//   const [analyses, setAnalyses] = useState<AnalysisData[]>([]);
//   const [meetingSession, setMeetingSession] = useState<MeetingSession | null>(null);
//   const [loading, setLoading] = useState(false);
//   const [status, setStatus] = useState<string>('Initializing...');
//   const [botStatus, setBotStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
//   const [sessionStartTime, setSessionStartTime] = useState<number>(0);
//   const [meetingInfo, setMeetingInfo] = useState<any>(null);

//   const transcriptsEndRef = useRef<HTMLDivElement>(null);

//   useEffect(() => {
//     const initializeAddon = async () => {
//       try {
//         const session = await meet.addon.createAddonSession({
//           cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
//         });
//         setAddonSession(session);

//         const client = await session.createSidePanelClient();
//         setSidePanelClient(client);

//         const coDoingClient = await session.createCoDoingClient({
//             activityTitle: "Recos AI Analysis",
//             onCoDoingStateChanged: (coDoingState) => {
//                 const state = JSON.parse(new TextDecoder().decode(coDoingState.bytes));
//                 console.log("Sidepanel received state update:", state);
//                 if (state.transcripts) {
//                     setTranscripts(state.transcripts);
//                 }
//                 if (state.analyses) {
//                     setAnalyses(state.analyses);
//                 }
//             },
//         });
//         setCoDoingClient(coDoingClient);

//         try {
//           const info = await client.getMeetingInfo();
//           setMeetingInfo(info);
//           console.log('Meeting info:', info);
//           setStatus(`Connected to meeting: ${info.meetingCode || 'Unknown'}`);
//         } catch (error) {
//           console.error('Failed to get meeting info:', error);
//           setStatus('Connected to meeting');
//         }

//         console.log('Add-on session initialized successfully');
//       } catch (error) {
//         console.error('Failed to initialize add-on session:', error);
//         setStatus('Failed to initialize add-on');
//       }
//     };

//     initializeAddon();
//   }, []);

//   const handleTranscriptReceived = useCallback((data: any) => {
//     // Handle analysis messages (Gemini insights)
//     if (data.analysis) {
//       console.log('Processing analysis data:', data);

//       const newAnalysis: AnalysisData = {
//         detected_question: data.analysis.detected_question || '',
//         candidate_answer_summary: data.analysis.candidate_answer_summary || 'No summary available',
//         semantics: data.analysis.semantics || 'No semantic analysis available',
//         questions: data.analysis.questions || [],
//         confidence: data.analysis.confidence || 0.8,
//         keywords: data.analysis.keywords || [],
//         answer_quality: data.analysis.answer_quality || 'unknown',
//         timestamp: data.timestamp || Date.now(),
//       };

//       setAnalyses((prev) => [newAnalysis, ...prev]);

//       // If it's an enriched transcript, also add it to transcripts
//       if (data.transcript) {
//         const enrichedTranscript: Transcript = {
//           speaker: data.speaker_name || 'Unknown Speaker',
//           text: data.transcript,
//           analysis: data.analysis,
//           timestamp: data.timestamp || Date.now(),
//           isFinal: true,
//           messageType: 'enriched_transcript',
//           segmentLength: data.transcript?.length,
//           analysisTimestamp: data.analysis_timestamp
//         };
//         setTranscripts((prev) => {
//           const otherTranscripts = prev.filter(t =>
//             !(t.messageType === 'interim_transcript' && t.speaker === enrichedTranscript.speaker)
//           );
//           return [...otherTranscripts, enrichedTranscript];
//         });
//       }
//       return;
//     }

//     // Handle regular transcript messages
//     const newTranscript: Transcript = {
//       speaker: data.speaker_name || 'Unknown',
//       text: data.transcript,
//       analysis: data.analysis,
//       timestamp: data.timestamp || Date.now(),
//       isFinal: data.is_final || false,
//       messageType: data.message_type,
//       segmentLength: data.transcript?.length,
//       analysisTimestamp: data.analysis_timestamp
//     };

//     setTranscripts((prev) => {
//       if (data.message_type === 'interim_transcript') {
//         const otherTranscripts = prev.filter(t =>
//           !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
//         );
//         return [...otherTranscripts, newTranscript];
//       }

//       if (data.message_type === 'final_transcript' || data.message_type === 'enriched_transcript') {
//         const otherTranscripts = prev.filter(t =>
//           !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
//         );
//         return [...otherTranscripts, newTranscript];
//       }

//       return [...prev, newTranscript];
//     });
//   }, []);

//   const {
//     isConnected,
//     connectionStatus,
//     lastMessageTime,
//     connect,
//     disconnect,
//   } = useTranscriptStream(handleTranscriptReceived);

//   const broadcastState = useCallback(() => {
//     if (!coDoingClient) return;

//     const state = {
//       transcripts,
//       analyses,
//       isConnected,
//       connectionStatus,
//     };

//     coDoingClient.broadcastStateUpdate({ bytes: new TextEncoder().encode(JSON.stringify(state)) });
//     console.log("Broadcasted state update", state);
//   }, [coDoingClient, transcripts, analyses, isConnected, connectionStatus]);

//   useEffect(() => {
//     broadcastState();
//   }, [broadcastState]);

//   useEffect(() => {
//     transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [transcripts]);

//   useEffect(() => {
//     const initializeTranscriptStream = async () => {
//       try {
//         setStatus('Connecting to transcript stream...');
//         await connect();
//         setStatus('Ready - Listening for transcripts');
//         setBotStatus('running');
//       } catch (error) {
//         console.error('Failed to connect to transcript stream:', error);
//         setStatus('Failed to connect to transcripts');
//         setBotStatus('error');
//       }
//     };

//     initializeTranscriptStream();

//     return () => {
//       disconnect();
//     };
//   }, [connect, disconnect]);


//   const clearTranscripts = (): void => {
//     setTranscripts([]);
//   };

//   const openMainStage = async (): Promise<void> => {
//     if (!sidePanelClient) {
//       setStatus('Add-on not initialized');
//       return;
//     }

//     try {
//       setLoading(true);
//       const mainStageUrl = `${window.location.origin}/mainstage`;
//       await sidePanelClient.startActivity({
//         mainStageUrl: mainStageUrl,
//       });
//       setStatus('Main stage opened for all participants');
//       console.log('Main stage opened successfully');
//     } catch (error) {
//       console.error('Error opening main stage:', error);
//       setStatus('Failed to open main stage');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const refreshMeetingInfo = async (): Promise<void> => {
//     if (!sidePanelClient) return;
//     try {
//       const info = await sidePanelClient.getMeetingInfo();
//       setMeetingInfo(info);
//       console.log('Meeting info refreshed:', info);
//       setStatus(`Meeting: ${info.meetingCode || 'Unknown ID'}`);
//     } catch (error) {
//       console.error('Error getting meeting info:', error);
//       setStatus('Failed to get meeting info');
//     }
//   };

//   const sessionDuration = sessionStartTime > 0
//     ? Math.floor((Date.now() - sessionStartTime) / 1000)
//     : 0;

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141244] to-[#1a1458] text-white p-6">
//       {/* Animated background */}
//       <div className="fixed inset-0 pointer-events-none overflow-hidden">
//         <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#803ceb]/10 rounded-full blur-3xl animate-pulse"></div>
//         <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#803ceb]/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
//         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#a855f7]/10 rounded-full blur-2xl animate-pulse delay-500"></div>
//       </div>

//       <div className="relative z-10 max-w-4xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-8">
//           <div className="flex items-center justify-center gap-4 mb-4">
//             <AIOrb isActive={isConnected} size="w-8 h-8" />
//             <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-[#803ceb] bg-clip-text text-transparent">
//               Recos AI
//             </h1>
//             <AIOrb isActive={isConnected} size="w-8 h-8" />
//           </div>
//           <p className="text-white/60 text-lg">Real-time meeting intelligence & analysis</p>
//         </div>

//         {/* Control Panel */}
//         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
//           <Card title="Transcript Controls" glowing={isConnected}>
//             <div className="space-y-4">
//               <div className="space-y-3">
//                 <p className="text-white/70 text-sm">
//                   Listening to real-time transcripts and AI analysis from the meeting.
//                 </p>
//                 <div className="flex gap-2">
//                   <Button
//                     onClick={() => connect()}
//                     disabled={isConnected || loading}
//                     loading={loading && isConnected}
//                     variant="success"
//                     className="flex-1"
//                   >
//                     {isConnected ? 'Connected' : 'Connect'}
//                   </Button>
//                   <Button
//                     onClick={() => disconnect()}
//                     disabled={!isConnected}
//                     variant="secondary"
//                     className="flex-1"
//                   >
//                     Disconnect
//                   </Button>
//                 </div>

//                 {!isConnected && (
//                   <p className="text-yellow-400 text-xs">
//                     {connectionStatus}
//                   </p>
//                 )}
//               </div>
//             </div>
//           </Card>

//           <Card title="Meeting Actions" glowing={!!sidePanelClient}>
//             <div className="space-y-4">
//               <Button
//                 onClick={openMainStage}
//                 disabled={!sidePanelClient || loading}
//                 variant="success"
//                 className="w-full"
//               >
//                 Open Main Stage
//               </Button>
//               <Button
//                 onClick={refreshMeetingInfo}
//                 disabled={!sidePanelClient}
//                 variant="secondary"
//                 className="w-full"
//               >
//                 Refresh Meeting Info
//               </Button>
//               <p className="text-white/50 text-xs mt-2">
//                 Main stage displays transcripts and AI insights to all participants.
//               </p>
//             </div>
//           </Card>
//         </div>

//         {/* AI Analysis */}
//         {analyses.length > 0 && (
//             <div className="mb-8">
//                 <Card title="AI Insight" glowing={true}>
//                     <div className="text-white/90 text-sm leading-relaxed">
//                         {analyses[0].candidate_answer_summary || analyses[0].semantics}
//                     </div>
//                     {analyses[0].keywords && analyses[0].keywords.length > 0 && (
//                         <div className="mt-4">
//                             <h4 className="text-sm font-bold text-white/70 mb-2">Keywords</h4>
//                             <div className="flex flex-wrap gap-2">
//                                 {analyses[0].keywords.map((keyword, i) => (
//                                     <span key={i} className="bg-purple-500/20 text-purple-300 text-xs font-medium px-2 py-1 rounded-full">
//                                         {keyword}
//                                     </span>
//                                 ))}
//                             </div>
//                         </div>
//                     )}
//                 </Card>
//             </div>
//         )}

//         {/* Transcripts and Analysis Stream */}
//         <Card title="Real-time Transcripts & AI Insights" glowing={isConnected}>
//           <div className="flex justify-between items-center mb-4">
//             <div className="text-sm text-white/60">
//               {transcripts.length} message{transcripts.length !== 1 ? 's' : ''} •
//               Last update: {lastMessageTime ? new Date(lastMessageTime).toLocaleTimeString() : 'Never'}
//             </div>
//             {transcripts.length > 0 && (
//               <Button onClick={clearTranscripts} variant="secondary" size="sm">
//                 Clear All
//               </Button>
//             )}
//           </div>

//           <div className="h-96 overflow-y-auto space-y-4 p-2 pr-4 custom-scrollbar">
//             {transcripts.length === 0 && (
//               <div className="text-center p-10 text-white/50">
//                 {isConnected ? (
//                   <>
//                     <AIOrb isActive={true} size="w-16 h-16 mx-auto mb-4" />
//                     <p className="mb-2">Listening for transcripts and AI analysis...</p>
//                     {/* <p className="text-sm">Regular transcripts and AI insights will appear here as the meeting progresses.</p> */}
//                   </>
//                 ) : (
//                   <>
//                     <p className="mb-2">Connect to start receiving real-time insights</p>
//                     {/* <p className="text-sm">Transcripts and AI analysis will appear here automatically.</p> */}
//                   </>
//                 )}
//               </div>
//             )}

//             <div className="space-y-4">
//               {transcripts.map((transcript, index) => (
//                 <TranscriptEntry
//                   key={`${transcript.timestamp}-${index}`}
//                   transcript={transcript}
//                   showSpeaker={false}
//                 />
//               ))}
//             </div>

//             <div ref={transcriptsEndRef} />
//           </div>
//         </Card>
//       </div>
//     </div>
//   );
// }

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import { BACKEND_URL } from '../utils/constants';
import { AIOrb } from '../components/AIOrb';
import { StatusIndicator } from '../components/StatusIndicator';
import { formatBytes, formatDuration } from '../utils/formatters';
import { Card } from '../components/Card';
import { TranscriptEntry } from '../components/TranscriptEntry';
import { MeetingSession, Transcript } from '../types';
import { useTranscriptStream } from '../hooks/useTranscriptStream';
import { meet } from '@googleworkspace/meet-addons/meet.addons';
import { Button } from '../components/Button';

interface AnalysisData {
  detected_question?: string;
  candidate_answer_summary?: string;
  semantics?: string;
  questions?: string[];
  confidence?: number;
  keywords?: string[];
  answer_quality?: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
  timestamp: number;
}

export default function SidePanel() {
  const [addonSession, setAddonSession] = useState<any>(null);
  const [sidePanelClient, setSidePanelClient] = useState<any>();
  const [coDoingClient, setCoDoingClient] = useState<any>();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisData[]>([]);
  const [meetingSession, setMeetingSession] = useState<MeetingSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('Initializing...');
  const [botStatus, setBotStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [sessionStartTime, setSessionStartTime] = useState<number>(0);
  const [meetingInfo, setMeetingInfo] = useState<any>(null);
  const [debugMode, setDebugMode] = useState<boolean>(false); // Add debug mode

  const transcriptsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeAddon = async () => {
      try {
        const session = await meet.addon.createAddonSession({
          cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
        });
        setAddonSession(session);

        const client = await session.createSidePanelClient();
        setSidePanelClient(client);

        const coDoingClient = await session.createCoDoingClient({
          activityTitle: "Recos AI Analysis",
          onCoDoingStateChanged: (coDoingState) => {
            const state = JSON.parse(new TextDecoder().decode(coDoingState.bytes));
            console.log("Sidepanel received state update:", state);
            if (state.transcripts) {
              setTranscripts(state.transcripts);
            }
            if (state.analyses) {
              setAnalyses(state.analyses);
            }
          },
        });
        setCoDoingClient(coDoingClient);

        try {
          const info = await client.getMeetingInfo();
          setMeetingInfo(info);
          console.log('Meeting info:', info);
          setStatus(`Connected to meeting: ${info.meetingCode || 'Unknown'}`);
        } catch (error) {
          console.error('Failed to get meeting info:', error);
          setStatus('Connected to meeting');
        }

        console.log('Add-on session initialized successfully');
      } catch (error) {
        console.error('Failed to initialize add-on session:', error);
        setStatus('Failed to initialize add-on');
      }
    };

    initializeAddon();
  }, []);

  // const handleTranscriptReceived = useCallback((data: any) => {
  //   console.log('Received data:', data);

  //   // Handle analysis messages (Gemini insights)
  //   if (data.analysis) {
  //     console.log('Processing analysis data:', data);
  //     console.log("Analysis block received:", data.analysis);


  //     const newAnalysis: AnalysisData = {
  //       detected_question: data.analysis.detected_question || '',
  //       candidate_answer_summary: data.analysis.candidate_answer_summary || 'No summary available',
  //       semantics: data.analysis.semantics || 'No semantic analysis available',
  //       questions: data.analysis.questions || [],
  //       confidence: data.analysis.confidence || 0.8,
  //       keywords: data.analysis.keywords || [],
  //       answer_quality: data.analysis.answer_quality || 'unknown',
  //       timestamp: data.timestamp || Date.now(),
  //     };

  //     console.log('Adding new analysis:', newAnalysis); 
  //     setAnalyses((prev) => [newAnalysis, ...prev]);

  //     // If it's an enriched transcript, also add it to transcripts
  //     if (data.transcript) {
  //       const enrichedTranscript: Transcript = {
  //         speaker: data.speaker_name || 'Unknown Speaker',
  //         text: data.transcript,
  //         analysis: data.analysis,
  //         timestamp: data.timestamp || Date.now(),
  //         isFinal: true,
  //         messageType: 'enriched_transcript',
  //         segmentLength: data.transcript?.length,
  //         analysisTimestamp: data.analysis_timestamp
  //       };
  //       setTranscripts((prev) => {
  //         const otherTranscripts = prev.filter(t =>
  //           !(t.messageType === 'interim_transcript' && t.speaker === enrichedTranscript.speaker)
  //         );
  //         return [...otherTranscripts, enrichedTranscript];
  //       });
  //     }
  //     return;
  //   }

  //   // Handle regular transcript messages
  //   const newTranscript: Transcript = {
  //     speaker: data.speaker_name || 'Unknown',
  //     text: data.transcript,
  //     analysis: data.analysis,
  //     timestamp: data.timestamp || Date.now(),
  //     isFinal: data.is_final || false,
  //     messageType: data.message_type,
  //     segmentLength: data.transcript?.length,
  //     analysisTimestamp: data.analysis_timestamp
  //   };

  //   setTranscripts((prev) => {
  //     if (data.message_type === 'interim_transcript') {
  //       const otherTranscripts = prev.filter(t =>
  //         !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
  //       );
  //       return [...otherTranscripts, newTranscript];
  //     }

  //     if (data.message_type === 'final_transcript' || data.message_type === 'enriched_transcript') {
  //       const otherTranscripts = prev.filter(t =>
  //         !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
  //       );
  //       return [...otherTranscripts, newTranscript];
  //     }

  //     return [...prev, newTranscript];
  //   });
  // }, []);

  const handleTranscriptReceived = useCallback((data: any) => {
    console.log('📨 RAW WebSocket message:', data);

    // Handle analysis messages - these come as enriched_transcript with analysis field
    if (data.analysis && data.message_type === 'enriched_transcript') {
      console.log('🎯 ANALYSIS RECEIVED:', data.analysis);

      const newAnalysis: AnalysisData = {
        detected_question: data.analysis.detected_question || '',
        candidate_answer_summary: data.analysis.candidate_answer_summary || 'No summary available',
        semantics: data.analysis.semantics || 'No semantic analysis available',
        questions: data.analysis.questions || [],
        confidence: data.analysis.confidence || 0.8,
        keywords: data.analysis.keywords || [],
        answer_quality: data.analysis.answer_quality || 'unknown',
        timestamp: data.timestamp || Date.now(),
      };

      console.log('💾 Storing analysis in state');
      setAnalyses((prev) => [newAnalysis, ...prev]);

      // Also add to transcripts as an enriched entry
      if (data.transcript) {
        const enrichedTranscript: Transcript = {
          speaker: data.speaker_name || 'Unknown Speaker',
          text: data.transcript,
          analysis: data.analysis,
          timestamp: data.timestamp || Date.now(),
          isFinal: true,
          messageType: 'enriched_transcript',
          segmentLength: data.transcript?.length,
          analysisTimestamp: Date.now()
        };

        setTranscripts((prev) => {
          const otherTranscripts = prev.filter(t =>
            !(t.messageType === 'interim_transcript' && t.speaker === enrichedTranscript.speaker)
          );
          return [...otherTranscripts, enrichedTranscript];
        });
      }
      return;
    }

    // Handle regular interim and final transcripts (without analysis)
    if (data.transcript && !data.analysis) {
      console.log('💬 Regular transcript:', data.message_type, data.transcript);

      const newTranscript: Transcript = {
        speaker: data.speaker_name || 'Unknown',
        text: data.transcript,
        timestamp: data.timestamp || Date.now(),
        isFinal: data.is_final || false,
        messageType: data.message_type || 'transcript',
        segmentLength: data.transcript?.length,
      };

      setTranscripts((prev) => {
        // For interim transcripts, replace previous interim from same speaker
        if (data.message_type === 'interim_transcript') {
          const otherTranscripts = prev.filter(t =>
            !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
          );
          return [...otherTranscripts, newTranscript];
        }

        // For final transcripts, remove interim and add final
        if (data.message_type === 'final_transcript') {
          const otherTranscripts = prev.filter(t =>
            !(t.messageType === 'interim_transcript' && t.speaker === newTranscript.speaker)
          );
          return [...otherTranscripts, newTranscript];
        }

        return [...prev, newTranscript];
      });
    }
  }, []);
  
  const {
    isConnected,
    connectionStatus,
    lastMessageTime,
    connect,
    disconnect,
  } = useTranscriptStream(handleTranscriptReceived);

  const broadcastState = useCallback(() => {
    if (!coDoingClient) return;

    const state = {
      transcripts,
      analyses,
      isConnected,
      connectionStatus,
    };

    coDoingClient.broadcastStateUpdate({ bytes: new TextEncoder().encode(JSON.stringify(state)) });
    console.log("Broadcasted state update", state);
  }, [coDoingClient, transcripts, analyses, isConnected, connectionStatus]);

  useEffect(() => {
    broadcastState();
  }, [broadcastState]);

  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  useEffect(() => {
    const initializeTranscriptStream = async () => {
      try {
        setStatus('Connecting to transcript stream...');
        await connect();
        setStatus('Ready - Listening for transcripts');
        setBotStatus('running');
      } catch (error) {
        console.error('Failed to connect to transcript stream:', error);
        setStatus('Failed to connect to transcripts');
        setBotStatus('error');
      }
    };

    initializeTranscriptStream();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);


  const clearTranscripts = (): void => {
    setTranscripts([]);
    setAnalyses([]); // Also clear analyses
  };

  const openMainStage = async (): Promise<void> => {
    if (!sidePanelClient) {
      setStatus('Add-on not initialized');
      return;
    }

    try {
      setLoading(true);
      const mainStageUrl = `${window.location.origin}/mainstage`;
      await sidePanelClient.startActivity({
        mainStageUrl: mainStageUrl,
      });
      setStatus('Main stage opened for all participants');
      console.log('Main stage opened successfully');
    } catch (error) {
      console.error('Error opening main stage:', error);
      setStatus('Failed to open main stage');
    } finally {
      setLoading(false);
    }
  };

  const refreshMeetingInfo = async (): Promise<void> => {
    if (!sidePanelClient) return;
    try {
      const info = await sidePanelClient.getMeetingInfo();
      setMeetingInfo(info);
      console.log('Meeting info refreshed:', info);
      setStatus(`Meeting: ${info.meetingCode || 'Unknown ID'}`);
    } catch (error) {
      console.error('Error getting meeting info:', error);
      setStatus('Failed to get meeting info');
    }
  };

  const sessionDuration = sessionStartTime > 0
    ? Math.floor((Date.now() - sessionStartTime) / 1000)
    : 0;

  // Helper function to get display text for analysis
  const getAnalysisDisplayText = (analysis: AnalysisData) => {
    if (analysis.candidate_answer_summary && analysis.candidate_answer_summary !== 'No summary available') {
      return analysis.candidate_answer_summary;
    }
    if (analysis.semantics && analysis.semantics !== 'No semantic analysis available') {
      return analysis.semantics;
    }
    if (analysis.detected_question) {
      return `Question detected: ${analysis.detected_question}`;
    }
    return 'Analysis data received but no content available';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141244] to-[#1a1458] text-white p-6">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#803ceb]/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#803ceb]/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#a855f7]/10 rounded-full blur-2xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <AIOrb isActive={isConnected} size="w-8 h-8" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-[#803ceb] bg-clip-text text-transparent">
              Recos AI
            </h1>
            <AIOrb isActive={isConnected} size="w-8 h-8" />
          </div>
          <p className="text-white/60 text-lg">Real-time meeting intelligence & analysis</p>

          {/* Debug toggle */}
          {/* <div className="mt-2">
            <button
              onClick={() => setDebugMode(!debugMode)}
              className="text-xs text-white/40 hover:text-white/60"
            >
              {debugMode ? 'Hide' : 'Show'} Debug Info
            </button>
          </div> */}
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card title="Transcript Controls" glowing={isConnected}>
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-white/70 text-sm">
                  Listening to real-time transcripts and AI analysis from the meeting.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => connect()}
                    disabled={isConnected || loading}
                    loading={loading && isConnected}
                    variant="success"
                    className="flex-1"
                  >
                    {isConnected ? 'Connected' : 'Connect'}
                  </Button>
                  <Button
                    onClick={() => disconnect()}
                    disabled={!isConnected}
                    variant="secondary"
                    className="flex-1"
                  >
                    Disconnect
                  </Button>
                </div>

                {!isConnected && (
                  <p className="text-yellow-400 text-xs">
                    {connectionStatus}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card title="Meeting Actions" glowing={!!sidePanelClient}>
            <div className="space-y-4">
              <Button
                onClick={openMainStage}
                disabled={!sidePanelClient || loading}
                variant="success"
                className="w-full"
              >
                Open Main Stage
              </Button>
              <Button
                onClick={refreshMeetingInfo}
                disabled={!sidePanelClient}
                variant="secondary"
                className="w-full"
              >
                Refresh Meeting Info
              </Button>
              <p className="text-white/50 text-xs mt-2">
                Main stage displays transcripts and AI insights to all participants.
              </p>
            </div>
          </Card>
        </div>

        {/* AI Analysis */}
        {analyses.length > 0 ? (
          <div className="mb-8">
            <Card title="AI Insight" glowing={true}>
              <div className="text-white/90 text-sm leading-relaxed">
                {getAnalysisDisplayText(analyses[0])}
              </div>

              {/* Show detected question if available */}
              {analyses[0].detected_question && (
                <div className="mt-3 p-3 bg-white/5 rounded-lg">
                  <h4 className="text-xs font-bold text-white/70 mb-1">Detected Question</h4>
                  <p className="text-white/80 text-sm italic">&quot;{analyses[0].detected_question}&quot;</p>
                </div>
              )}

              {/* Show answer quality if available */}
              {analyses[0].answer_quality && analyses[0].answer_quality !== 'unknown' && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs font-bold text-white/70">Answer Quality:</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${analyses[0].answer_quality === 'excellent' ? 'bg-green-500/20 text-green-300' :
                      analyses[0].answer_quality === 'good' ? 'bg-blue-500/20 text-blue-300' :
                        analyses[0].answer_quality === 'fair' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-red-500/20 text-red-300'
                    }`}>
                    {analyses[0].answer_quality}
                  </span>
                </div>
              )}

              {/* Show keywords if available */}
              {analyses[0].keywords && analyses[0].keywords.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-bold text-white/70 mb-2">Keywords</h4>
                  <div className="flex flex-wrap gap-2">
                    {analyses[0].keywords.map((keyword, i) => (
                      <span key={i} className="bg-purple-500/20 text-purple-300 text-xs font-medium px-2 py-1 rounded-full">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Show follow-up questions if available */}
              {analyses[0].questions && analyses[0].questions.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-bold text-white/70 mb-2">Follow-up Questions</h4>
                  <ul className="space-y-1">
                    {analyses[0].questions.map((question, i) => (
                      <li key={i} className="text-white/70 text-sm pl-4 relative">
                        <span className="absolute left-0">•</span>
                        {question}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Debug info */}
              {/* {debugMode && (
                <div className="mt-4 p-2 bg-black/20 rounded text-xs text-white/50">
                  <p>Confidence: {analyses[0].confidence}</p>
                  <p>Timestamp: {new Date(analyses[0].timestamp).toLocaleTimeString()}</p>
                  <p>Raw data: {JSON.stringify(analyses[0], null, 2)}</p>
                </div>
              )} */}
            </Card>
          </div>
        ) : (
          <div className="mb-8">
            <Card title="AI Insight" glowing={false}>
              <div className="text-center p-6 text-white/50">
                <p>Waiting for analysis data...</p>
                {isConnected ? (
                  <p className="text-sm mt-2">Analysis will appear here as the conversation progresses.</p>
                ) : (
                  <p className="text-sm mt-2">Connect to start receiving analysis.</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Transcripts and Analysis Stream */}
        <Card title="Real-time Transcripts" glowing={isConnected}>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-white/60">
              {transcripts.length} message{transcripts.length !== 1 ? 's' : ''} •
              Last update: {lastMessageTime ? new Date(lastMessageTime).toLocaleTimeString() : 'Never'}
            </div>
            {transcripts.length > 0 && (
              <Button onClick={clearTranscripts} variant="secondary" size="sm">
                Clear All
              </Button>
            )}
          </div>

          <div className="h-96 overflow-y-auto space-y-4 p-2 pr-4 custom-scrollbar">
            {transcripts.length === 0 ? (
              <div className="text-center p-10 text-white/50">
                {isConnected ? (
                  <>
                    <AIOrb isActive={true} size="w-16 h-16 mx-auto mb-4" />
                    <p className="mb-2">Listening for transcripts and AI analysis...</p>
                  </>
                ) : (
                  <>
                    <p className="mb-2">Connect to start receiving real-time insights</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {transcripts.map((transcript, index) => (
                  <TranscriptEntry
                    key={`${transcript.timestamp}-${index}`}
                    transcript={transcript}
                    showSpeaker={false}
                  />
                ))}
              </div>
            )}

            <div ref={transcriptsEndRef} />
          </div>
        </Card>
      </div>
    </div>
  );
}



// "use client";

// import { useEffect, useState, useRef, useCallback } from 'react';
// import { AIOrb } from '../components/AIOrb';
// import { Card } from '../components/Card';
// import { TranscriptEntry } from '../components/TranscriptEntry';
// import { useTranscriptStream } from '../hooks/useTranscriptStream';
// import { meet } from '@googleworkspace/meet-addons/meet.addons';
// import { Button } from '../components/Button';

// interface AnalysisData {
//   detected_question?: string;
//   candidate_answer_summary?: string;
//   semantics?: string;
//   questions?: string[];
//   confidence?: number;
//   keywords?: string[];
//   answer_quality?: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
//   timestamp: number;
// }

// interface Transcript {
//   speaker: string;
//   text: string;
//   timestamp: number;
//   isFinal: boolean;
//   messageType?: string;
//   segmentLength?: number;
//   analysisTimestamp?: number;
// }

// export default function SidePanel() {
//   const [addonSession, setAddonSession] = useState<any>(null);
//   const [sidePanelClient, setSidePanelClient] = useState<any>();
//   const [coDoingClient, setCoDoingClient] = useState<any>();
//   const [transcripts, setTranscripts] = useState<Transcript[]>([]);
//   const [analyses, setAnalyses] = useState<AnalysisData[]>([]);
//   const [status, setStatus] = useState<string>('Initializing...');
//   const [botStatus, setBotStatus] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
//   const [meetingInfo, setMeetingInfo] = useState<any>(null);
//   const transcriptsEndRef = useRef<HTMLDivElement>(null);

//   useEffect(() => {
//     const initializeAddon = async () => {
//       try {
//         const session = await meet.addon.createAddonSession({
//           cloudProjectNumber: process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER || '',
//         });
//         setAddonSession(session);
//         const client = await session.createSidePanelClient();
//         setSidePanelClient(client);
//         const coDoingClient = await session.createCoDoingClient({
//           activityTitle: "Recos AI Analysis",
//           onCoDoingStateChanged: (coDoingState) => {
//             const state = JSON.parse(new TextDecoder().decode(coDoingState.bytes));
//             if (state.transcripts) setTranscripts(state.transcripts);
//             if (state.analyses) setAnalyses(state.analyses);
//           },
//         });
//         setCoDoingClient(coDoingClient);

//         try {
//           const info = await client.getMeetingInfo();
//           setMeetingInfo(info);
//           setStatus(`Connected to meeting: ${info.meetingCode || 'Unknown'}`);
//         } catch (error) {
//           setStatus('Connected to meeting');
//         }
//       } catch (error) {
//         setStatus('Failed to initialize add-on');
//       }
//     };
//     initializeAddon();
//   }, []);

//   // Independent transcript/analyzer handler
//   const handleTranscriptReceived = useCallback((data: any) => {
//     // If analysis is present, add to analyses only
//     if (data.analysis) {
//       const newAnalysis: AnalysisData = {
//         detected_question: data.analysis.detected_question,
//         candidate_answer_summary: data.analysis.candidate_answer_summary,
//         semantics: data.analysis.semantics,
//         questions: data.analysis.questions,
//         confidence: data.analysis.confidence,
//         keywords: data.analysis.keywords,
//         answer_quality: data.analysis.answer_quality,
//         timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
//       };
//       setAnalyses(prev => [newAnalysis, ...prev]);
//       return;
//     }

//     // Only transcript (interim/final/enriched types)
//     if (data.transcript) {
//       const newTranscript: Transcript = {
//         speaker: data.speaker_name || 'Unknown',
//         text: data.transcript,
//         timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
//         isFinal: !!data.is_final,
//         messageType: data.message_type,
//         segmentLength: data.transcript?.length,
//         analysisTimestamp: undefined,
//       };
//       setTranscripts(prev => [newTranscript, ...prev]);
//     }
//   }, []);

//   // transcript stream + connection
//   const {
//     isConnected,
//     connectionStatus,
//     lastMessageTime,
//     connect,
//     disconnect,
//   } = useTranscriptStream(handleTranscriptReceived);

//   useEffect(() => {
//     transcriptsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [transcripts, analyses]);

//   useEffect(() => {
//     const initializeTranscriptStream = async () => {
//       try {
//         setStatus('Connecting to transcript stream...');
//         await connect();
//         setStatus('Ready - Listening for transcripts');
//         setBotStatus('running');
//       } catch (error) {
//         setStatus('Failed to connect to transcripts');
//         setBotStatus('error');
//       }
//     };
//     initializeTranscriptStream();
//     return () => { disconnect(); };
//   }, [connect, disconnect]);

//   const clearTranscripts = (): void => {
//     setTranscripts([]);
//   };
//   const clearAnalyses = (): void => {
//     setAnalyses([]);
//   };

//   const openMainStage = async (): Promise<void> => {
//     if (!sidePanelClient) { setStatus('Add-on not initialized'); return; }
//     try {
//       await sidePanelClient.startActivity({ mainStageUrl: `${window.location.origin}/mainstage` });
//       setStatus('Main stage opened for all participants');
//     } catch (error) {
//       setStatus('Failed to open main stage');
//     }
//   };

//   const refreshMeetingInfo = async (): Promise<void> => {
//     if (!sidePanelClient) return;
//     try {
//       const info = await sidePanelClient.getMeetingInfo();
//       setMeetingInfo(info);
//       setStatus(`Meeting: ${info.meetingCode || 'Unknown ID'}`);
//     } catch (error) {
//       setStatus('Failed to get meeting info');
//     }
//   };

//   // Helper function to get display text for analysis
//   const getAnalysisDisplayText = (analysis?: AnalysisData) => {
//     if (!analysis) return 'Analysis data received but no content available';
//     if (analysis.candidate_answer_summary && analysis.candidate_answer_summary !== 'No summary available') {
//       return analysis.candidate_answer_summary;
//     }
//     if (analysis.semantics && analysis.semantics !== 'No semantic analysis available') {
//       return analysis.semantics;
//     }
//     if (analysis.detected_question) {
//       return `Question detected: ${analysis.detected_question}`;
//     }
//     return 'Analysis data received but no content available';
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] via-[#141244] to-[#1a1458] text-white p-6">
//       {/* Animated background */}
//       <div className="fixed inset-0 pointer-events-none overflow-hidden">
//         <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#803ceb]/10 rounded-full blur-3xl animate-pulse"></div>
//         <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#803ceb]/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
//         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-[#a855f7]/10 rounded-full blur-2xl animate-pulse delay-500"></div>
//       </div>

//       <div className="relative z-10 max-w-4xl mx-auto">
//         {/* Header and Controls */}
//         <div className="text-center mb-8">
//           <div className="flex items-center justify-center gap-4 mb-4">
//             <AIOrb isActive={isConnected} size="w-8 h-8" />
//             <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-[#803ceb] bg-clip-text text-transparent">
//               Recos AI
//             </h1>
//             <AIOrb isActive={isConnected} size="w-8 h-8" />
//           </div>
//           <p className="text-white/60 text-lg">Real-time meeting intelligence & analysis</p>
//         </div>

//         <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
//           <Card title="Transcript Controls" glowing={isConnected}>
//             <div className="space-y-4">
//               <div className="space-y-3">
//                 <p className="text-white/70 text-sm">
//                   Listening to real-time transcripts and AI analysis from the meeting.
//                 </p>
//                 <div className="flex gap-2">
//                   <Button onClick={() => connect()} disabled={isConnected}>Connect</Button>
//                   <Button onClick={() => disconnect()} disabled={!isConnected}>Disconnect</Button>
//                 </div>
//                 {!isConnected && (
//                   <p className="text-yellow-400 text-xs">{connectionStatus}</p>
//                 )}
//               </div>
//             </div>
//           </Card>
//           <Card title="Meeting Actions" glowing={!!sidePanelClient}>
//             <div className="space-y-4">
//               <Button onClick={openMainStage} disabled={!sidePanelClient}>Open Main Stage</Button>
//               <Button onClick={refreshMeetingInfo} disabled={!sidePanelClient}>Refresh Meeting Info</Button>
//               <p className="text-white/50 text-xs mt-2">
//                 Main stage displays transcripts and AI insights to all participants.
//               </p>
//             </div>
//           </Card>
//         </div>

//         {/* Independent Gemini Analysis Section */}
//         <Card title="Gemini AI Analyses" glowing={analyses.length > 0}>
//           <div className="flex justify-between items-center mb-4">
//             <div className="text-sm text-white/60">
//               {analyses.length} analysis{analyses.length !== 1 ? 'es' : ''} •
//               Last update: {analyses.length > 0 ? new Date(analyses[0].timestamp).toLocaleTimeString() : 'Never'}
//             </div>
//             {analyses.length > 0 && (
//               <Button onClick={clearAnalyses} variant="secondary" size="sm">Clear All</Button>
//             )}
//           </div>
//           <div className="h-64 overflow-y-auto space-y-4 p-2 pr-4 custom-scrollbar">
//             {analyses.length === 0 ? (
//               <div className="text-center p-6 text-white/50">
//                 <p>Waiting for analysis data...</p>
//                 {isConnected ? (
//                   <p className="text-sm mt-2">Analyses will appear here as the conversation progresses.</p>
//                 ) : (
//                   <p className="text-sm mt-2">Connect to start receiving analyses.</p>
//                 )}
//               </div>
//             ) : (
//               analyses.map((analysis, index) => (
//                 <div key={analysis.timestamp + '-' + index} className="bg-[#322762]/60 rounded p-3">
//                   <div className="text-white/90 text-sm">{getAnalysisDisplayText(analysis)}</div>
//                   {analysis.detected_question && (
//                     <div className="mt-1 text-xs text-white/70">
//                       <span className="font-bold mr-2">Detected Question:</span>
//                       <span className="italic">{analysis.detected_question}</span>
//                     </div>
//                   )}
//                   {analysis.keywords && analysis.keywords.length > 0 && (
//                     <div className="mt-1 text-xs text-purple-300">
//                       <span className="font-bold mr-2">Keywords:</span>
//                       {analysis.keywords.join(', ')}
//                     </div>
//                   )}
//                   {analysis.questions && analysis.questions.length > 0 && (
//                     <div className="mt-1 text-xs text-blue-200">
//                       <span className="font-bold mr-2">Follow-up Questions:</span>
//                       {analysis.questions.join('; ')}
//                     </div>
//                   )}
//                   {analysis.answer_quality && (
//                     <div className="mt-1 text-xs">
//                       <span className="font-bold">Answer quality:</span> {analysis.answer_quality}
//                     </div>
//                   )}
//                 </div>
//               ))
//             )}
//           </div>
//         </Card>

//         {/* Independent Transcript Section */}
//         <Card title="Transcripts Stream" glowing={isConnected}>
//           <div className="flex justify-between items-center mb-4">
//             <div className="text-sm text-white/60">
//               {transcripts.length} message{transcripts.length !== 1 ? 's' : ''} •
//               Last update: {transcripts.length > 0 ? new Date(transcripts[0].timestamp).toLocaleTimeString() : 'Never'}
//             </div>
//             {transcripts.length > 0 && (
//               <Button onClick={clearTranscripts} variant="secondary" size="sm">Clear All</Button>
//             )}
//           </div>
//           <div className="h-64 overflow-y-auto space-y-4 p-2 pr-4 custom-scrollbar">
//             {transcripts.length === 0 ? (
//               <div className="text-center p-10 text-white/50">
//                 {isConnected ? (
//                   <>
//                     <AIOrb isActive={true} size="w-16 h-16 mx-auto mb-4" />
//                     <p className="mb-2">Listening for transcripts...</p>
//                   </>
//                 ) : (
//                   <>
//                     <p className="mb-2">Connect to start receiving transcripts.</p>
//                   </>
//                 )}
//               </div>
//             ) : (
//               transcripts.map((transcript, index) => (
//                 <TranscriptEntry
//                   key={transcript.timestamp + '-' + index}
//                   transcript={transcript}
//                   showSpeaker={true}
//                 />
//               ))
//             )}
//             <div ref={transcriptsEndRef} />
//           </div>
//         </Card>
//       </div>
//     </div>
//   );
// }