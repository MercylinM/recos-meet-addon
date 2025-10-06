import { WebSocketStatus } from "@/app/types";
import { AIOrb } from "../AIOrb";


interface StatusIndicatorProps {
    status: string;
    isConnected: boolean;
    wsStatus: WebSocketStatus;
}

export const StatusIndicator = ({ status, isConnected, wsStatus }: StatusIndicatorProps) => (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-[#141244]/40 to-[#803ceb]/20 backdrop-blur-sm border border-[#803ceb]/30">
        <div className="flex items-center gap-2">
            <AIOrb isActive={isConnected && wsStatus.audioConnected} size="w-3 h-3" />
            <AIOrb isActive={isConnected && wsStatus.transcriptConnected} size="w-3 h-3" />
        </div>
        <div className="flex-1">
            <div className="text-xs text-[#803ceb] font-medium uppercase tracking-wide">System Status</div>
            <div className="text-white/90 text-sm">{status}</div>
        </div>
    </div>
);