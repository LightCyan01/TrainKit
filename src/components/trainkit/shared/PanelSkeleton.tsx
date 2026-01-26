import { memo } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface PanelSkeletonProps {
  className?: string;
}

export const PanelSkeleton = memo(function PanelSkeleton({ className }: PanelSkeletonProps) {
  return (
    <div
      className={cn(
        "flex justify-center h-full overflow-auto p-6 animate-pulse",
        className,
      )}
    >
      <div className="flex flex-col gap-6 w-full max-w-6xl">
        {/* Panel Header Skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-linear-to-r from-primary/20 to-transparent" />
          <div className="h-4 w-40 bg-muted rounded" />
          <div className="h-px flex-1 bg-linear-to-l from-primary/20 to-transparent" />
        </div>

        {/* Loading indicator */}
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          <span className="text-xs text-muted-foreground tracking-wider uppercase">
            Loading Panel...
          </span>
        </div>

        {/* Content Skeleton Blocks */}
        <div className="panel panel-bottom p-4 space-y-4">
          <div className="h-3 w-32 bg-muted rounded" />
          <div className="space-y-3">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </div>

        <div className="panel panel-bottom p-4 space-y-4">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="space-y-3">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </div>
      </div>
    </div>
  );
});
