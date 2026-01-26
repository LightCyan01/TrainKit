import { memo } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Cpu, Loader2 } from "lucide-react";

export type ModelLoadState = "idle" | "loading" | "loaded" | "error";

interface ModelStatusProps {
  modelName?: string;
  isLoaded: boolean;
  details?: string;
  loadState?: ModelLoadState;
  memoryUsageInGB?: number;
}

export const ModelStatus = memo(function ModelStatus({
  modelName,
  isLoaded,
  details,
  loadState = "idle",
  memoryUsageInGB,
}: ModelStatusProps) {
  if (!modelName) return null;

  const isActivelyLoaded = loadState === "loaded";
  const isLoading = loadState === "loading";

  const displayDetails = (() => {
    if (isLoading) return "Loading model into GPU memory...";
    if (isActivelyLoaded && memoryUsageInGB !== undefined) {
      return `${memoryUsageInGB.toFixed(2)} GB VRAM | Loaded`;
    }
    return details;
  })();

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 border transition-all",
        isActivelyLoaded
          ? "border-accent/30 bg-accent/5"
          : isLoaded
            ? "border-success/30 bg-success/5"
            : "border-muted/30 bg-muted/5",
      )}
    >
      <Cpu
        className={cn(
          "h-4 w-4",
          isActivelyLoaded
            ? "text-accent"
            : isLoaded
              ? "text-success"
              : "text-muted-foreground",
        )}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {modelName}
        </p>
        {displayDetails && (
          <p
            className={cn(
              "text-[10px]",
              isActivelyLoaded
                ? "text-accent"
                : isLoading
                  ? "text-muted-foreground animate-pulse"
                  : "text-muted-foreground",
            )}
          >
            {displayDetails}
          </p>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 text-accent shrink-0 animate-spin" />
      ) : isActivelyLoaded ? (
        <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
      ) : isLoaded ? (
        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </div>
  );
});
