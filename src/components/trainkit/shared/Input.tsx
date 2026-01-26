import { memo } from "react";
import { cn } from "@/lib/utils";
import { Folder } from "lucide-react";

interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "path";
  onBrowse?: () => void;
  disabled?: boolean;
}

export const Input = memo(function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  onBrowse,
  disabled = false,
}: InputProps) {
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

        <div className="flex">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              "flex-1 bg-input border border-border px-4 py-3",
              "text-sm text-foreground placeholder:text-muted-foreground/50",
              "focus:outline-none focus:border-primary/50 focus:bg-input/80",
              "transition-all duration-200",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              type === "path" && "font-mono text-xs",
              type === "path" && onBrowse && "pr-12",
            )}
          />
          {type === "path" && onBrowse && (
            <button
              type="button"
              onClick={onBrowse}
              disabled={disabled}
              className={cn(
                "absolute right-0 top-0 bottom-0 px-3",
                "flex items-center justify-center",
                "border-l border-border bg-secondary/50",
                "text-muted-foreground hover:text-primary hover:bg-primary/10",
                "transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Folder className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
