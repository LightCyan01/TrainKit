import { contextBridge, ipcRenderer } from "electron";
import type { ElectronAPI } from "./types/electron";

const electronAPI = {
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("window:maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("window:isMaximized"),

  getBackendStatus: () => ipcRenderer.invoke("backend:status"),
  backendRequest: (request) => ipcRenderer.invoke("backend:request", request),
  onBackendReady: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("backend:ready", handler);
    return () => ipcRenderer.removeListener("backend:ready", handler);
  },
  onBackendStatus: (callback) => {
    const handler = (_event: unknown, status: Parameters<typeof callback>[0]) => callback(status);
    ipcRenderer.on("backend:status-changed", handler);
    return () => ipcRenderer.removeListener("backend:status-changed", handler);
  },
  onBackendEvent: (callback) => {
    const handler = (_event: unknown, event: Parameters<typeof callback>[0]) => callback(event);
    ipcRenderer.on("backend:event", handler);
    return () => ipcRenderer.removeListener("backend:event", handler);
  },
  onMainLog: (callback) => {
    const handler = (_event: unknown, log: Parameters<typeof callback>[0]) => callback(log);
    ipcRenderer.on("main:log", handler);
    return () => ipcRenderer.removeListener("main:log", handler);
  },

  onSplashStatus: (callback) => {
    const handler = (_event: unknown, status: string) => callback(status);
    ipcRenderer.on("splash:status", handler);
    return () => ipcRenderer.removeListener("splash:status", handler);
  },
  onSetupMode: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("setup:mode", handler);
    return () => ipcRenderer.removeListener("setup:mode", handler);
  },
  onSetupProgress: (callback) => {
    const handler = (_event: unknown, data: Parameters<typeof callback>[0]) => callback(data);
    ipcRenderer.on("setup:progress", handler);
    return () => ipcRenderer.removeListener("setup:progress", handler);
  },
  onSetupLog: (callback) => {
    const handler = (_event: unknown, data: Parameters<typeof callback>[0]) => callback(data);
    ipcRenderer.on("setup:log", handler);
    return () => ipcRenderer.removeListener("setup:log", handler);
  },

  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  openFile: (options) => ipcRenderer.invoke("dialog:openFile", options),
  pathExists: (path) => ipcRenderer.invoke("fs:pathExists", path),
  isValidModel: (path) => ipcRenderer.invoke("fs:isValidModel", path),
  isValidModelFolder: (path) => ipcRenderer.invoke("fs:isValidModelFolder", path),
  listImages: (directoryPath) => ipcRenderer.invoke("fs:listImages", directoryPath),
  readImageAsDataUrl: (imagePath) => ipcRenderer.invoke("fs:readImageAsDataUrl", imagePath),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openLogFile: () => ipcRenderer.invoke("log:openFile"),
  openLogsFolder: () => ipcRenderer.invoke("log:openFolder"),
  getLogFilePath: () => ipcRenderer.invoke("log:getPath"),
  getMainLogs: () => ipcRenderer.invoke("log:getEntries"),
} satisfies ElectronAPI;

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
