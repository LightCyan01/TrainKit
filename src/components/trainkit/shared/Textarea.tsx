import { memo } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export const Textarea = memo(function Textarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled = false,
}: TextareaProps) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
        {label}
      </label>
      <div className="relative group">
        {/* Corner brackets */}
        <div className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-primary/50 group-focus-within:border-primary transition-colors" />
        <div className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-primary/50 group-focus-within:border-primary transition-colors" />
        <div className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-primary/50 group-focus-within:border-primary transition-colors" />
        <div className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-primary/50 group-focus-within:border-primary transition-colors" />

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={cn(
            "w-full bg-input border border-border px-4 py-3",
            "text-sm text-foreground placeholder:text-muted-foreground/50",
            "focus:outline-none focus:border-primary/50 focus:bg-input/80",
            "transition-all duration-200 resize-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        />
      </div>
    </div>
  );
});
