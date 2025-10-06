import { AIOrb } from "../AIOrb";

interface ButtonProps {
    onClick: () => void;
    children: React.ReactNode;
    variant?: "primary" | "secondary" | "danger" | "success";
    disabled?: boolean;
    loading?: boolean;
    className?: string;
    size?: 'sm' | 'md' | 'lg';
}

export const Button = ({
    onClick,
    children,
    variant = "primary",
    disabled = false,
    loading = false,
    className = "",
    size = "md"
}: ButtonProps) => {
    const baseClasses = "relative px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-50 disabled:cursor-not-allowed";

    const sizeClasses = {
        sm: "px-4 py-2 text-sm",
        md: "px-6 py-3",
        lg: "px-8 py-4 text-lg"
    };

    const variants = {
        primary: "bg-gradient-to-r from-[#803ceb] to-[#a855f7] hover:from-[#7c3aed] hover:to-[#9333ea] text-white shadow-lg shadow-[#803ceb]/30 hover:shadow-[#803ceb]/50",
        secondary: "bg-gradient-to-r from-[#141244] to-[#1e1065] hover:from-[#1a1458] hover:to-[#2d1b69] text-white border border-[#803ceb]/30 hover:border-[#803ceb]/50",
        danger: "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-lg shadow-red-600/30",
        success: "bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg shadow-emerald-600/30"
    };

    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            className={`${baseClasses} ${sizeClasses[size]} ${variants[variant]} ${className}`}
        >
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <AIOrb isActive={true} size="w-5 h-5" />
                </div>
            )}
            <span className={loading ? "opacity-0" : ""}>{children}</span>
        </button>
    );
};