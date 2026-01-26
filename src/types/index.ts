// Panel processing status
export type PanelStatus = "idle" | "processing" | "success" | "error";

//Log level types
export type LogLevel = "info" | "success" | "warning" | "error";

//Progress data from WebSocket
export interface ProgressData {
  type: "progress";
  current: number;
  total: number;
  message: string;
  percent: number;
}

//Log entry 
export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  source: "frontend" | "backend" | "main";
}
