import React from "react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useWebSocket, LogEntry } from "@/lib/websocket-context";
import {
  Terminal,
  Trash2,
  Download,
  Pause,
  Play,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  ChevronDown,
  Search,
  FolderOpen,
} from "lucide-react";

type LogLevel = "info" | "success" | "warning" | "error";

interface LogsPanelProps {
  isBackendOnline: boolean;
}

const levelConfig: Record<
  LogLevel,
  { icon: React.ReactNode; color: string; bgColor: string }
> = {
  info: {
    icon: <Info className="h-3 w-3" />,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  success: {
    icon: <CheckCircle className="h-3 w-3" />,
    color: "text-success",
    bgColor: "bg-success/10",
  },
  warning: {
    icon: <AlertTriangle className="h-3 w-3" />,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  error: {
    icon: <AlertCircle className="h-3 w-3" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
};

export function LogsPanel({ isBackendOnline }: LogsPanelProps) {
  const { logs, clearLogs, isConnected } = useWebSocket();
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "frontend" | "backend" | "main"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [pausedLogs, setPausedLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // When pausing, capture current; logs when resuming, sync with live logs
  useEffect(() => {
    if (isPaused) {
      setPausedLogs(logs);
    }
  }, [isPaused]);

  // Use paused logs when paused
  const displayLogs = isPaused ? pausedLogs : logs;

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logsEndRef.current && !isPaused) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll, isPaused]);

  // Handle manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  const handleClear = () => {
    clearLogs();
    setPausedLogs([]);
  };

  const handleExport = () => {
    const logText = displayLogs
      .map(
        (log) =>
          `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`,
      )
      .join("\n");

    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trainkit-logs-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = displayLogs.filter((log) => {
    const matchesLevel = filter === "all" || log.level === filter;
    const matchesSource = sourceFilter === "all" || log.source === sourceFilter;
    const matchesSearch =
      searchQuery === "" ||
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSource && matchesSearch;
  });

  const logCounts = {
    all: displayLogs.length,
    info: displayLogs.filter((l) => l.level === "info").length,
    success: displayLogs.filter((l) => l.level === "success").length,
    warning: displayLogs.filter((l) => l.level === "warning").length,
    error: displayLogs.filter((l) => l.level === "error").length,
  };

  const sourceCounts = {
    all: displayLogs.length,
    frontend: displayLogs.filter((l) => l.source === "frontend").length,
    backend: displayLogs.filter((l) => l.source === "backend").length,
    main: displayLogs.filter((l) => l.source === "main").length,
  };

  return (
    <div className="flex justify-center h-full p-6">
      <div className="flex flex-col gap-4 w-full max-w-5xl">
        {/* Panel Header */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-linear-to-r from-primary/50 to-transparent" />
          <h2 className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            System Logs
          </h2>
          <div className="h-px flex-1 bg-linear-to-l from-primary/50 to-transparent" />
        </div>

        {/* Controls Bar */}
        <div className="panel panel-bottom p-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
                className="w-full bg-input border border-border rounded px-3 py-1.5 pl-9 text-xs font-mono
                placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>

            {/* Level Filter */}
            <div className="relative">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as LogLevel | "all")}
                className="appearance-none bg-input border border-border rounded px-3 py-1.5 pr-8 text-xs font-mono
                text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
              >
                <option value="all">All ({logCounts.all})</option>
                <option value="info">Info ({logCounts.info})</option>
                <option value="success">Success ({logCounts.success})</option>
                <option value="warning">Warning ({logCounts.warning})</option>
                <option value="error">Error ({logCounts.error})</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {/* Source Filter */}
            <div className="relative">
              <select
                value={sourceFilter}
                onChange={(e) =>
                  setSourceFilter(
                    e.target.value as "all" | "frontend" | "backend" | "main",
                  )
                }
                className="appearance-none bg-input border border-border rounded px-3 py-1.5 pr-8 text-xs font-mono
                text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 cursor-pointer"
              >
                <option value="all">All Sources ({sourceCounts.all})</option>
                <option value="main">Main ({sourceCounts.main})</option>
                <option value="frontend">
                  Frontend ({sourceCounts.frontend})
                </option>
                <option value="backend">
                  Backend ({sourceCounts.backend})
                </option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors",
                  isPaused
                    ? "border-success/50 text-success bg-success/10 hover:bg-success/20"
                    : "border-yellow-500/50 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20",
                )}
              >
                {isPaused ? (
                  <Play className="h-3 w-3" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
                {isPaused ? "Resume" : "Pause"}
              </button>

              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border 
                text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Download className="h-3 w-3" />
                Export
              </button>

              <button
                onClick={() => window.electronAPI?.openLogFile()}
                title="Open the persistent log file in your default text editor"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border 
                text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <FolderOpen className="h-3 w-3" />
                Log File
              </button>

              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-destructive/50 
                text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* Logs Container */}
        <div className="panel panel-bottom flex-1 overflow-hidden flex flex-col">
          {/* Terminal Header */}
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-dark/50">
            <Terminal className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">
              Console Output
            </span>
            <div className="ml-auto flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isBackendOnline
                      ? "bg-success animate-pulse"
                      : "bg-destructive",
                  )}
                />
                <span className="text-[10px] text-muted-foreground">
                  Backend: {isBackendOnline ? "Online" : "Offline"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isConnected ? "bg-success animate-pulse" : "bg-yellow-500",
                  )}
                />
                <span className="text-[10px] text-muted-foreground">
                  WebSocket: {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
          </div>

          {/* Logs List */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto p-2 font-mono text-xs space-y-1"
          >
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Terminal className="h-8 w-8 opacity-50" />
                <span className="text-xs">No logs to display</span>
              </div>
            ) : (
              <>
                {filteredLogs.map((log) => {
                  const config = levelConfig[log.level];
                  const sourceColor =
                    log.source === "frontend"
                      ? "text-blue-400"
                      : "text-emerald-400";
                  return (
                    <div
                      key={log.id}
                      className={cn(
                        "flex items-start gap-2 px-2 py-1.5 rounded transition-colors hover:bg-secondary/30",
                        config.bgColor,
                      )}
                    >
                      {/* Timestamp */}
                      <span className="text-muted-foreground/70 shrink-0">
                        [
                        {log.timestamp.toLocaleTimeString("en-US", {
                          hour12: false,
                        })}
                        ]
                      </span>

                      {/* Level Icon */}
                      <span className={cn("shrink-0 mt-0.5", config.color)}>
                        {config.icon}
                      </span>

                      {/* Source */}
                      <span
                        className={cn("shrink-0 font-semibold", sourceColor)}
                      >
                        [{log.source}]
                      </span>

                      {/* Message */}
                      <span className="text-foreground/90 break-all">
                        {log.message}
                      </span>
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </>
            )}
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-dark/30 text-[10px] text-muted-foreground">
            <span>
              Showing {filteredLogs.length} of {logs.length} entries
            </span>
            <div className="flex items-center gap-3">
              {isPaused && (
                <span className="flex items-center gap-1 text-yellow-500">
                  <Pause className="h-2.5 w-2.5" />
                  Paused
                </span>
              )}
              <span
                className={cn(
                  "flex items-center gap-1",
                  autoScroll ? "text-success" : "text-muted-foreground",
                )}
              >
                Auto-scroll: {autoScroll ? "ON" : "OFF"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
