export interface ElectronAPI {
  // Window controls
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;

  // Backend
  getBackendStatus: () => Promise<{
    status: string;
    isRunning: boolean;
    url: string;
  }>;
  onBackendReady: (callback: () => void) => () => void;
  onMainLog: (
    callback: (log: {
      level: string;
      message: string;
      source: string;
    }) => void,
  ) => () => void;

  // Splash/Setup
  onSplashStatus: (callback: (status: string) => void) => () => void;
  onSetupProgress: (
    callback: (data: { status: string; message: string; progress?: number }) => void,
  ) => () => void;
  onSetupLog: (
    callback: (data: { message: string; type?: string }) => void,
  ) => () => void;

  // Dialogs
  openDirectory: () => Promise<string | null>;
  openFile: (options?: {
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string | null>;

  // File system
  pathExists: (path: string) => Promise<boolean>;
  isValidModel: (
    path: string,
  ) => Promise<{ valid: boolean; name?: string; size?: number }>;
  isValidModelFolder: (
    path: string,
  ) => Promise<{ valid: boolean; name?: string }>;
  listImages: (directoryPath: string) => Promise<string[]>;
  readImageAsDataUrl: (imagePath: string) => Promise<string | null>;

  // Shell
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
