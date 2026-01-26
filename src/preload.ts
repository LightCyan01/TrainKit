import { contextBridge, ipcRenderer } from "electron";

//Expose Electron APIs to the renderer process.
contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("window:maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("window:isMaximized"),

  // Backend status
  getBackendStatus: () => ipcRenderer.invoke("backend:status"),
  onBackendReady: (callback: () => void) => {
    ipcRenderer.on("backend:ready", callback);
    return () => ipcRenderer.removeListener("backend:ready", callback);
  },

  // Main process logs
  onMainLog: (
    callback: (log: { level: string; message: string; source: string }) => void,
  ) => {
    const handler = (
      _event: unknown,
      log: { level: string; message: string; source: string },
    ) => callback(log);
    ipcRenderer.on("main:log", handler);
    return () => ipcRenderer.removeListener("main:log", handler);
  },

  // Splash screen status
  onSplashStatus: (callback: (status: string) => void) => {
    const handler = (_event: unknown, status: string) => callback(status);
    ipcRenderer.on("splash:status", handler);
    return () => ipcRenderer.removeListener("splash:status", handler);
  },

  // Setup mode notification
  onSetupMode: (callback: () => void) => {
    ipcRenderer.on("setup:mode", callback);
    return () => ipcRenderer.removeListener("setup:mode", callback);
  },

  // Setup progress
  onSetupProgress: (
    callback: (data: { status: string; message: string; progress?: number }) => void,
  ) => {
    const handler = (
      _event: unknown,
      data: { status: string; message: string; progress?: number },
    ) => callback(data);
    ipcRenderer.on("setup:progress", handler);
    return () => ipcRenderer.removeListener("setup:progress", handler);
  },

  // Setup log output
  onSetupLog: (
    callback: (data: { message: string; type?: string }) => void,
  ) => {
    const handler = (
      _event: unknown,
      data: { message: string; type?: string },
    ) => callback(data);
    ipcRenderer.on("setup:log", handler);
    return () => ipcRenderer.removeListener("setup:log", handler);
  },

  // File/directory dialogs
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  openFile: (options?: {
    filters?: { name: string; extensions: string[] }[];
  }) => ipcRenderer.invoke("dialog:openFile", options),

  // File system utilities
  pathExists: (path: string) => ipcRenderer.invoke("fs:pathExists", path),
  isValidModel: (
    path: string,
  ): Promise<{ valid: boolean; name?: string; size?: number }> =>
    ipcRenderer.invoke("fs:isValidModel", path),
  isValidModelFolder: (
    path: string,
  ): Promise<{ valid: boolean; name?: string }> =>
    ipcRenderer.invoke("fs:isValidModelFolder", path),
  listImages: (directoryPath: string): Promise<string[]> =>
    ipcRenderer.invoke("fs:listImages", directoryPath),
  readImageAsDataUrl: (imagePath: string): Promise<string | null> =>
    ipcRenderer.invoke("fs:readImageAsDataUrl", imagePath),

  // External links
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("shell:openExternal", url),
});
