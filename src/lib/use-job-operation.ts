import { useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useWebSocket } from "@/lib/websocket-context";
import type { JobOperation, JobRecord } from "@/types/contracts";

const ACTIVE = new Set(["queued", "running", "cancelling"]);

export function useJobOperation(operation: JobOperation) {
  const { jobs, addFrontendLog } = useWebSocket();
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<JobRecord | null>(null);
  const latestForOperation = useMemo(
    () =>
      Object.values(jobs)
        .filter((job) => job.operation === operation)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    [jobs, operation],
  );
  const job = (jobId ? jobs[jobId] : null) ?? submitted ?? latestForOperation;
  const isActive = Boolean(job && ACTIVE.has(job.status));

  async function start(path: string, body: unknown) {
    const created = await apiRequest<JobRecord>(path, { method: "POST", body });
    setJobId(created.job_id);
    setSubmitted(created);
    addFrontendLog("info", `Started ${operation} job ${created.job_id.slice(0, 8)}`);
    return created;
  }

  async function cancel() {
    if (!job || !ACTIVE.has(job.status)) return;
    const updated = await apiRequest<JobRecord>(`/jobs/${job.job_id}`, {
      method: "DELETE",
    });
    setSubmitted(updated);
    addFrontendLog("warning", `Cancellation requested for ${operation}`);
  }

  return { job, isActive, start, cancel };
}
