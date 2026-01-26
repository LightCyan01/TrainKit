import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "destructive";
  size?: "default" | "lg";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const Button = memo(function Button({
  children,
  onClick,
  variant = "primary",
  size = "default",
  disabled = false,
  loading = false,
  className,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "relative font-semibold tracking-wider uppercase transition-all duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        // Clipped corners
        "btn-clipped",
        // Variants
        variant === "primary" && [
          "bg-linear-to-r from-primary to-primary/90 text-primary-foreground",
          "hover:from-primary/90 hover:to-primary/80",
          "shadow-[0_0_15px_rgba(255,107,26,0.3)]",
          "hover:shadow-[0_0_25px_rgba(255,107,26,0.5)]",
          !disabled && !loading && "glow-pulse",
        ],
        variant === "secondary" && [
          "bg-secondary border border-border text-secondary-foreground",
          "hover:bg-secondary/80 hover:border-primary/50",
        ],
        variant === "destructive" && [
          "bg-destructive/20 border border-destructive/50 text-destructive",
          "hover:bg-destructive/30 hover:border-destructive",
        ],
        // Sizes
        size === "default" && "px-6 py-3 text-sm",
        size === "lg" && "px-8 py-4 text-base",
        className,
      )}
    >
      {/* Inner glow effect for primary */}
      {variant === "primary" && !disabled && !loading && (
        <div className="absolute inset-0 btn-clipped bg-linear-to-r from-transparent via-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
      )}

      <span className="relative flex items-center justify-center gap-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </span>
    </button>
  );
});
