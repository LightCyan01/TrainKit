import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { getBackendManager } from "./backend-manager";

if (started) app.quit();

const backendManager = getBackendManager({
  host: "127.0.0.1",
  port: 8000,
  debug: true,
});

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.webContents.openDevTools();
};

// IPC handler for backend status
ipcMain.handle("backend:status", () => {
  return {
    status: backendManager.getStatus(),
    isRunning: backendManager.getStatus() === "running",
    url: backendManager.getServerUrl(),
  };
});

app.on("ready", () => {
  createWindow();
  console.log("Window created - starting backend...");

  // Start backend and notify renderer when ready
  backendManager.start().then(async () => {
    const ready = await backendManager.waitForReady();
    if (ready) {
      console.log(`Backend ready at: ${backendManager.getServerUrl()}`);
      mainWindow?.webContents.send("backend:ready");
    } else {
      console.error("Backend failed to become ready");
    }
  });
});

app.on("window-all-closed", async () => {
  await backendManager.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", async () => {
  await backendManager.stop();
});
