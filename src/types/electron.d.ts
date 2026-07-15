import type { BackendEvent, BackendResponse, LogLevel, LogSource } from "./contracts";

export interface MainLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  source: LogSource;
}

export interface ElectronAPI {
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;

  getBackendStatus: () => Promise<{
    status: "stopped" | "starting" | "running" | "error";
    isRunning: boolean;
    version: string;
    error: string | null;
  }>;
  backendRequest: <T = unknown>(request: {
    path: string;
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
  }) => Promise<BackendResponse<T>>;
  onBackendReady: (callback: () => void) => () => void;
  onBackendStatus: (
    callback: (status: {
      status: string;
      isRunning: boolean;
      error: string | null;
    }) => void,
  ) => () => void;
  onBackendEvent: (callback: (event: BackendEvent) => void) => () => void;
  onMainLog: (
    callback: (log: MainLogEntry) => void,
  ) => () => void;

  onSplashStatus: (callback: (status: string) => void) => () => void;
  onSetupMode: (callback: () => void) => () => void;
  onSetupProgress: (
    callback: (data: { status: string; message: string; progress?: number }) => void,
  ) => () => void;
  onSetupLog: (
    callback: (data: { message: string; type?: string }) => void,
  ) => () => void;

  openDirectory: () => Promise<string | null>;
  openFile: (options?: {
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;
  pathExists: (path: string) => Promise<boolean>;
  isValidModel: (
    path: string,
  ) => Promise<{ valid: boolean; name?: string; size?: number }>;
  isValidModelFolder: (
    path: string,
  ) => Promise<{ valid: boolean; name?: string }>;
  listImages: (directoryPath: string) => Promise<string[]>;
  readImageAsDataUrl: (imagePath: string) => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  openLogFile: () => Promise<void>;
  openLogsFolder: () => Promise<void>;
  getLogFilePath: () => Promise<string>;
  getMainLogs: () => Promise<MainLogEntry[]>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
