interface AIOrbProps {
    isActive: boolean;
    size?: string;
}

export const AIOrb = ({ isActive, size = "w-4 h-4" }: AIOrbProps) => (
    <div className={`${size} rounded-full bg-gradient-to-r from-[#803ceb] to-[#a855f7] ${isActive ? 'animate-pulse shadow-lg shadow-purple-400/50' : 'opacity-50'
        } transition-all duration-300`}>
        <div className="w-full h-full rounded-full bg-gradient-to-r from-[#803ceb] to-[#a855f7] animate-spin opacity-75"></div>
    </div>
);