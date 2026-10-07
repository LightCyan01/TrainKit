import { useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket-context";
import type { JobOperation, JobRecord } from "@/types/contracts";

const ACTIVE = new Set(["queued", "running", "cancelling"]);

export function useJobOperation(operation: JobOperation) {
  const { jobs, addFrontendLog, updateJob } = useWebSocket();
  const [jobId, setJobId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const latestForOperation = useMemo(
    () =>
      Object.values(jobs)
        .filter((job) => job.operation === operation)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    [jobs, operation],
  );
  const job = (jobId ? jobs[jobId] : null) ?? latestForOperation;
  const isActive = isSubmitting || Boolean(job && ACTIVE.has(job.status));

  async function start(path: string, body: unknown) {
    if (submissionPending.current || (job && ACTIVE.has(job.status))) return;
    submissionPending.current = true;
    setIsSubmitting(true);
    try {
      const created = await apiRequest<JobRecord>(path, { method: "POST", body });
      updateJob(created);
      setJobId(created.job_id);
      addFrontendLog("info", `Started ${operation} job ${created.job_id.slice(0, 8)}`);
      return created;
    } finally {
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  }

  async function cancel() {
    if (submissionPending.current || !job || !ACTIVE.has(job.status)) return;
    try {
      const updated = await apiRequest<JobRecord>(`/jobs/${job.job_id}`, {
        method: "DELETE",
      });
      updateJob(updated);
      addFrontendLog("warning", `Cancellation requested for ${operation}`);
    } catch (error) {
      addFrontendLog("error", `Could not cancel ${operation}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { job, isActive, isSubmitting, start, cancel };
}
