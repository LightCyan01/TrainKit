import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from "react";

type LogLevel = "info" | "success" | "warning" | "error";

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  source: "frontend" | "backend" | "main";
}

export interface ProgressData {
  type: "progress";
  current: number;
  total: number;
  message: string;
  percent: number;
}

interface WebSocketContextValue {
  isConnected: boolean;
  progress: ProgressData | null;
  logs: LogEntry[];
  addFrontendLog: (level: LogLevel, message: string) => void;
  clearLogs: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
  isBackendOnline: boolean;
}

export function WebSocketProvider({
  children,
  isBackendOnline,
}: WebSocketProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Generate unique log ID
  const generateLogId = () =>
    `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Add a backend log entry
  const addBackendLog = useCallback((level: LogLevel, message: string) => {
    const newLog: LogEntry = {
      id: generateLogId(),
      timestamp: new Date(),
      level,
      message,
      source: "backend",
    };
    setLogs((prev) => [...prev.slice(-499), newLog]);
  }, []);

  // Add a frontend log entry
  const addFrontendLog = useCallback((level: LogLevel, message: string) => {
    const newLog: LogEntry = {
      id: generateLogId(),
      timestamp: new Date(),
      level,
      message,
      source: "frontend",
    };
    setLogs((prev) => [...prev.slice(-499), newLog]);
  }, []);

  // Clear all logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Connect to WebSocket
  const connectWebSocket = useCallback(
    (backendUrl: string) => {
      // Close existing connection
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // Clear any pending reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Convert http:// to ws://
      const wsUrl = backendUrl.replace("http://", "ws://") + "/ws/progress";

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[WebSocket] Connected");
          setIsConnected(true);
          addBackendLog("info", "Connected to backend WebSocket");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "progress") {
              // Update
              setProgress(data as ProgressData);

              // Add as log
              addBackendLog("info", data.message);

              // Clear after completion
              if (data.current === data.total && data.total > 0) {
                setTimeout(() => setProgress(null), 3000);
              }
            } else if (data.type === "log") {
              addBackendLog(data.level as LogLevel, data.message);
            }
          } catch {
            addBackendLog("info", event.data);
          }
        };

        ws.onerror = (error) => {
          console.error("[WebSocket] Error:", error);
          addBackendLog("error", "WebSocket connection error");
        };

        ws.onclose = () => {
          console.log("[WebSocket] Disconnected");
          setIsConnected(false);
          wsRef.current = null;

          // Attempt reconnection
          if (isBackendOnline) {
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isBackendOnline && !wsRef.current) {
                window.electronAPI.getBackendStatus().then((status) => {
                  if (status.isRunning) {
                    connectWebSocket(status.url);
                  }
                });
              }
            }, 5000);
          }
        };
      } catch (error) {
        console.error("[WebSocket] Failed to connect:", error);
        addBackendLog("error", "Failed to connect to WebSocket");
      }
    },
    [isBackendOnline, addBackendLog],
  );

  useEffect(() => {
    if (!window.electronAPI) return;

    if (isBackendOnline) {
      // Connect when backend comes online
      window.electronAPI.getBackendStatus().then((status) => {
        if (status.isRunning) {
          connectWebSocket(status.url);
        }
      });
    } else {
      // Close when backend goes offline
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isBackendOnline, connectWebSocket]);

  // Listen for main process logs
  useEffect(() => {
    if (!window.electronAPI?.onMainLog) return;

    const cleanup = window.electronAPI.onMainLog((log) => {
      const newLog: LogEntry = {
        id: generateLogId(),
        timestamp: new Date(),
        level: log.level as LogLevel,
        message: log.message,
        source: log.source as "frontend" | "backend",
      };
      setLogs((prev) => [...prev.slice(-499), newLog]);
    });

    return cleanup;
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const value = useMemo<WebSocketContextValue>(() => ({
    isConnected,
    progress,
    logs,
    addFrontendLog,
    clearLogs,
  }), [isConnected, progress, logs, addFrontendLog, clearLogs]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  }
  return context;
}
