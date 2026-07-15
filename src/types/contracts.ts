export type LogLevel = "debug" | "info" | "success" | "warning" | "error";
export type LogSource =
  | "frontend"
  | "backend"
  | "main"
  | "python"
  | "setup"
  | "logger"
  | "security";
export type JobOperation = "caption" | "upscale" | "rename" | "tag";
export type JobStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";
export type CollisionPolicy = "fail" | "skip" | "overwrite" | "rename";

export interface JobRecord {
  job_id: string;
  operation: JobOperation;
  status: JobStatus;
  current: number;
  total: number;
  message: string;
  percent: number;
  manifest_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobEvent extends JobRecord {
  type: "job";
}

export interface LogEvent {
  type: "log";
  level: LogLevel;
  message: string;
  source: LogSource;
}

export type BackendEvent = JobEvent | LogEvent;

export interface BackendErrorEnvelope {
  error: { code: string; message: string };
}

export interface BackendResponse<T> {
  ok: boolean;
  status: number;
  data: T | BackendErrorEnvelope;
}

const JOB_OPERATIONS: readonly JobOperation[] = ["caption", "upscale", "rename", "tag"];
const JOB_STATUSES: readonly JobStatus[] = [
  "queued",
  "running",
  "cancelling",
  "cancelled",
  "completed",
  "failed",
];
const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "success", "warning", "error"];
const LOG_SOURCES: readonly LogSource[] = [
  "frontend",
  "backend",
  "main",
  "python",
  "setup",
  "logger",
  "security",
];

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isJobEvent(value: unknown): value is JobEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<JobEvent>;
  return (
    event.type === "job" &&
    typeof event.job_id === "string" &&
    JOB_OPERATIONS.includes(event.operation as JobOperation) &&
    JOB_STATUSES.includes(event.status as JobStatus) &&
    typeof event.current === "number" &&
    Number.isFinite(event.current) &&
    event.current >= 0 &&
    typeof event.total === "number" &&
    Number.isFinite(event.total) &&
    event.total >= 0 &&
    typeof event.percent === "number" &&
    Number.isFinite(event.percent) &&
    event.percent >= 0 &&
    event.percent <= 100 &&
    typeof event.message === "string" &&
    isNullableString(event.manifest_path) &&
    isNullableString(event.error) &&
    typeof event.created_at === "string" &&
    typeof event.updated_at === "string"
  );
}

export function isLogEvent(value: unknown): value is LogEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<LogEvent>;
  return (
    event.type === "log" &&
    LOG_LEVELS.includes(event.level as LogLevel) &&
    LOG_SOURCES.includes(event.source as LogSource) &&
    typeof event.message === "string"
  );
}
