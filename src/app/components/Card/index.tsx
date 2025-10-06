import { AIOrb } from "../AIOrb";

interface CardProps {
    title: string;
    children: React.ReactNode;
    className?: string;
    glowing?: boolean;
}

export const Card = ({ title, children, className = "", glowing = false }: CardProps) => (
    <div className={`relative p-6 rounded-2xl bg-gradient-to-br from-[#141244]/60 to-[#1a1458]/40 backdrop-blur-md border ${glowing
            ? 'border-[#803ceb]/50 shadow-2xl shadow-[#803ceb]/20'
            : 'border-[#803ceb]/20'
        } transition-all duration-500 ${className}`}>
        {glowing && (
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#803ceb]/10 to-transparent animate-pulse"></div>
        )}
        <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
                <AIOrb isActive={glowing} size="w-4 h-4" />
                <h3 className="text-lg font-semibold text-white">{title}</h3>
            </div>
            {children}
        </div>
    </div>
);