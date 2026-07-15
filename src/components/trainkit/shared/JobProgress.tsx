import { Progress } from "./Progress";
import type { JobRecord } from "@/types/contracts";

export function JobProgress({ job }: { job: JobRecord | null }) {
  if (!job) return null;
  const status =
    job.status === "completed"
      ? "success"
      : job.status === "failed" || job.status === "cancelled"
        ? "error"
        : "processing";
  return (
    <div className="space-y-2">
      <Progress
        status={status}
        progress={job.current}
        total={job.total}
        currentFile={job.message}
        errorMessage={job.error ?? (job.status === "cancelled" ? "Job cancelled" : undefined)}
      />
      {job.manifest_path && (
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          Manifest: {job.manifest_path}
        </p>
      )}
    </div>
  );
}
