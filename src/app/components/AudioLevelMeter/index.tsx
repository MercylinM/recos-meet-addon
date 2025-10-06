interface AudioLevelMeterProps {
    level: number;
}

export const AudioLevelMeter = ({ level }: AudioLevelMeterProps) => (
    <div className="w-full bg-[#141244] rounded-full h-2 mb-3">
        <div
            className="bg-gradient-to-r from-[#803ceb] to-[#a855f7] h-2 rounded-full transition-all duration-100"
            style={{ width: `${level * 100}%` }}
        ></div>
    </div>
);