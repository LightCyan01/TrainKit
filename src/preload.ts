import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getBackendStatus: () => ipcRenderer.invoke("backend:status"),
  onBackendReady: (callback: () => void) => {
    ipcRenderer.on("backend:ready", callback);
    return () => ipcRenderer.removeListener("backend:ready", callback);
  },
});
