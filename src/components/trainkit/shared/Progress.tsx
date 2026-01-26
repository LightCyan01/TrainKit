import { memo } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface ProgressProps {
  status: "idle" | "processing" | "success" | "error";
  progress: number;
  total: number;
  currentFile?: string;
  errorMessage?: string;
}

export const Progress = memo(function Progress({
  status,
  progress,
  total,
  currentFile,
  errorMessage,
}: ProgressProps) {
  const percentage = total > 0 ? Math.round((progress / total) * 100) : 0;

  if (status === "idle") return null;

  return (
    <div
      className={cn(
        "relative p-4 border transition-all duration-300",
        status === "processing" && "border-primary/30 bg-primary/5",
        status === "success" && "border-success/30 bg-success/5",
        status === "error" && "border-destructive/30 bg-destructive/5",
      )}
    >
      {/* Corner brackets */}
      <div
        className={cn(
          "absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 transition-colors",
          status === "processing" && "border-primary",
          status === "success" && "border-success",
          status === "error" && "border-destructive",
        )}
      />
      <div
        className={cn(
          "absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 transition-colors",
          status === "processing" && "border-primary",
          status === "success" && "border-success",
          status === "error" && "border-destructive",
        )}
      />
      <div
        className={cn(
          "absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 transition-colors",
          status === "processing" && "border-primary",
          status === "success" && "border-success",
          status === "error" && "border-destructive",
        )}
      />
      <div
        className={cn(
          "absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 transition-colors",
          status === "processing" && "border-primary",
          status === "success" && "border-success",
          status === "error" && "border-destructive",
        )}
      />

      {/* Status header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {status === "processing" && (
            <>
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
              <span className="text-xs font-medium tracking-wider text-primary uppercase">
                Processing
              </span>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-xs font-medium tracking-wider text-success uppercase">
                Complete
              </span>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-xs font-medium tracking-wider text-destructive uppercase">
                Error
              </span>
            </>
          )}
        </div>

        {status === "processing" && (
          <span className="font-mono text-sm text-foreground">
            {progress} / {total} ({percentage}%)
          </span>
        )}
      </div>

      {/* Progress bar */}
      {status === "processing" && (
        <div className="relative h-2 bg-secondary overflow-hidden mb-3">
          <div
            className="absolute inset-y-0 left-0 bg-linear-to-r from-primary/80 to-primary transition-all duration-300 sweep-highlight"
            style={{ width: `${percentage}%` }}
          />
          {/* Animated highlight sweep */}
          <div className="absolute inset-y-0 w-1/4 bg-linear-to-r from-transparent via-white/20 to-transparent animate-[sweep_1.5s_ease-in-out_infinite]" />
        </div>
      )}

      {/* Current file or message */}
      {status === "processing" && currentFile && (
        <p className="text-xs text-muted-foreground font-mono truncate">
          Processing: {currentFile}
        </p>
      )}

      {status === "success" && (
        <p className="text-sm text-success">
          Successfully processed {total} files
        </p>
      )}

      {status === "error" && errorMessage && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </div>
  );
});
