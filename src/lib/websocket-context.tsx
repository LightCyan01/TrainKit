import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isJobEvent,
  isLogEvent,
  type JobRecord,
  type LogLevel,
  type LogSource,
} from "@/types/contracts";
import type { MainLogEntry } from "@/types/electron";

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  source: LogSource;
}

interface BackendEventsContextValue {
  isConnected: boolean;
  jobs: Record<string, JobRecord>;
  latestJob: JobRecord | null;
  progress: JobRecord | null;
  logs: LogEntry[];
  addFrontendLog: (level: LogLevel, message: string) => void;
  clearLogs: () => void;
}

const BackendEventsContext = createContext<BackendEventsContextValue | null>(null);

function logId() {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function persistedLogId(log: MainLogEntry) {
  return `main-${log.timestamp}-${log.level}-${log.source}-${log.message}`;
}

export function WebSocketProvider({
  children,
  isBackendOnline,
}: {
  children: ReactNode;
  isBackendOnline: boolean;
}) {
  const [jobs, setJobs] = useState<Record<string, JobRecord>>({});
  const [latestJob, setLatestJob] = useState<JobRecord | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const appendLog = useCallback(
    (
      level: LogLevel,
      message: string,
      source: LogSource,
      timestamp = new Date(),
      id = logId(),
    ) => {
      setLogs((previous) => {
        if (previous.some((entry) => entry.id === id)) return previous;
        return [
          ...previous.slice(-499),
          { id, timestamp, level, message, source },
        ];
      });
    },
    [],
  );
  const addFrontendLog = useCallback(
    (level: LogLevel, message: string) => appendLog(level, message, "frontend"),
    [appendLog],
  );
  const clearLogs = useCallback(() => setLogs([]), []);

  useEffect(() => {
    const removeBackend = window.electronAPI.onBackendEvent((event) => {
      if (isJobEvent(event)) {
        const job: JobRecord = event;
        setJobs((previous) => ({ ...previous, [job.job_id]: job }));
        setLatestJob(job);
      } else if (isLogEvent(event)) {
        appendLog(event.level, event.message, event.source ?? "backend");
      }
    });
    const removeMain = window.electronAPI.onMainLog((log) => {
      appendLog(
        log.level,
        log.message,
        log.source,
        new Date(log.timestamp),
        persistedLogId(log),
      );
    });
    void window.electronAPI.getMainLogs().then((history) => {
      for (const log of history) {
        appendLog(
          log.level,
          log.message,
          log.source,
          new Date(log.timestamp),
          persistedLogId(log),
        );
      }
    });
    return () => {
      removeBackend();
      removeMain();
    };
  }, [appendLog]);

  const value = useMemo(
    () => ({
      isConnected: isBackendOnline,
      jobs,
      latestJob,
      progress: latestJob,
      logs,
      addFrontendLog,
      clearLogs,
    }),
    [isBackendOnline, jobs, latestJob, logs, addFrontendLog, clearLogs],
  );
  return (
    <BackendEventsContext.Provider value={value}>
      {children}
    </BackendEventsContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(BackendEventsContext);
  if (!context) throw new Error("useWebSocket must be used within WebSocketProvider");
  return context;
}
