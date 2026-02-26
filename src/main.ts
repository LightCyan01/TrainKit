import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import started from "electron-squirrel-startup";
import { getBackendManager, BackendManager } from "./backend-manager";
import { getSetupManager, SetupProgress } from "./setup-manager";
import { getLogger, closeLogger } from "./logger";

if (started) app.quit();
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const backendManager = getBackendManager({
  host: "127.0.0.1",
  port: 8000,
});

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

const createSplashWindow = () => {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 320,
    frame: false,
    transparent: false,
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  const appPath = app.getAppPath();
  const splashPath = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? path.join(appPath, "src", "splash.html")
    : path.join(__dirname, "splash.html");

  splashWindow.loadFile(splashPath);

  splashWindow.once("ready-to-show", () => {
    splashWindow?.show();
  });

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
};

const updateSplashStatus = (status: string) => {
  splashWindow?.webContents.send("splash:status", status);
};

const sendSetupProgress = (progress: SetupProgress) => {
  splashWindow?.webContents.send("setup:progress", progress);
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0f0f0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.once("ready-to-show", () => {
    setTimeout(() => {
      mainWindow?.show();
      mainWindow?.focus();
      splashWindow?.close();
    }, 500);
  });
};

// IPC: Get backend status
ipcMain.handle("backend:status", () => {
  return {
    status: backendManager.getStatus(),
    isRunning: backendManager.getStatus() === "running",
    url: backendManager.getServerUrl(),
  };
});

// IPC: Window controls
ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle("window:close", () => {
  if (mainWindow) {
    mainWindow.close();
  } else if (splashWindow) {
    splashWindow.close();
    app.quit();
  }
});

ipcMain.handle("window:isMaximized", () => {
  return mainWindow?.isMaximized() ?? false;
});

// IPC: Open external URL in default browser
ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  await shell.openExternal(url);
});

// IPC: Open log file in default text editor
ipcMain.handle("log:openFile", async () => {
  const logger = getLogger();
  await shell.openPath(logger.getLogFilePath());
});

// IPC: Get log file path
ipcMain.handle("log:getPath", () => {
  return getLogger().getLogFilePath();
});

// IPC: Open directory picker
ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC: Open file picker
ipcMain.handle(
  "dialog:openFile",
  async (
    _event,
    options?: { filters?: { name: string; extensions: string[] }[] },
  ) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: options?.filters ?? [{ name: "All Files", extensions: ["*"] }],
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  },
);

// IPC: Validate path exists
ipcMain.handle(
  "fs:pathExists",
  async (_event, pathToCheck: string): Promise<boolean> => {
    try {
      await fs.promises.access(pathToCheck, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },
);

// IPC: Check if path is a valid model file
ipcMain.handle(
  "fs:isValidModel",
  async (
    _event,
    modelPath: string,
  ): Promise<{ valid: boolean; name?: string; size?: number }> => {
    try {
      const stats = await fs.promises.stat(modelPath);
      if (!stats.isFile()) {
        return { valid: false };
      }
      const ext = path.extname(modelPath).toLowerCase();
      const validExtensions = [".safetensors", ".pth", ".pt", ".bin", ".ckpt"];
      if (!validExtensions.includes(ext)) {
        return { valid: false };
      }
      return {
        valid: true,
        name: path.basename(modelPath),
        size: stats.size,
      };
    } catch {
      return { valid: false };
    }
  },
);

// IPC: Check if path is a valid model folder
ipcMain.handle(
  "fs:isValidModelFolder",
  async (
    _event,
    folderPath: string,
  ): Promise<{ valid: boolean; name?: string }> => {
    try {
      const stats = await fs.promises.stat(folderPath);
      if (!stats.isDirectory()) {
        return { valid: false };
      }
      // check for config files
      const configFiles = ["config.json", "tokenizer_config.json"];
      for (const configFile of configFiles) {
        const configPath = path.join(folderPath, configFile);
        try {
          await fs.promises.access(configPath, fs.constants.F_OK);
          return {
            valid: true,
            name: path.basename(folderPath),
          };
        } catch {
          // continue
        }
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  },
);

// IPC: List images in a directory
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

ipcMain.handle(
  "fs:listImages",
  async (_event, directoryPath: string): Promise<string[]> => {
    try {
      const files = await fs.promises.readdir(directoryPath);
      const images = files
        .filter((file) => {
          const ext = path.extname(file).toLowerCase();
          return IMAGE_EXTENSIONS.includes(ext);
        })
        .map((file) => path.join(directoryPath, file))
        .sort();
      return images;
    } catch {
      return [];
    }
  },
);

// IPC: Read image as base64 data URL
ipcMain.handle(
  "fs:readImageAsDataUrl",
  async (_event, imagePath: string): Promise<string | null> => {
    try {
      const ext = path.extname(imagePath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || "image/png";
      const data = await fs.promises.readFile(imagePath);
      const base64 = data.toString("base64");
      return `data:${mimeType};base64,${base64}`;
    } catch {
      return null;
    }
  },
);

app.on("ready", async () => {
  createSplashWindow();

  const setupManager = getSetupManager();

  if (setupManager.isSetupRequired()) {
    splashWindow?.setSize(400, 500);
    splashWindow?.center();
    splashWindow?.webContents.send("setup:mode");
    updateSplashStatus("First-time setup...");

    const setupLogger = getLogger();
    const setupSuccess = await setupManager.runSetup((progress) => {
      sendSetupProgress(progress);
      const logLevel =
        progress.status === "error"
          ? "error"
          : progress.status === "complete"
            ? "success"
            : "info";
      if (progress.message) setupLogger[logLevel]("setup", progress.message);
    });

    if (!setupSuccess) {
      updateSplashStatus("Setup failed");
      return;
    }
  }

  updateSplashStatus("Starting backend...");

  // Start backend
  backendManager.start().then(async () => {
    updateSplashStatus("Waiting for backend...");

    const ready = await backendManager.waitForReady();
    if (ready) {
      updateSplashStatus("Loading interface...");

      createWindow();

      setTimeout(() => {
        BackendManager.sendLogsToUI();
        const logger = getLogger();
        logger.success(
          "main",
          `Backend ready at: ${backendManager.getServerUrl()}`,
        );
        mainWindow?.webContents.send("backend:ready");
      }, 600);
    } else {
      updateSplashStatus("Backend failed to start");
      createWindow();
      setTimeout(() => {
        BackendManager.sendLogsToUI();
        const logger = getLogger();
        logger.error("main", "Backend failed to become ready");
        logger.error("main", `Backend status: ${backendManager.getStatus()}`);
        logger.error("main", `Check log file: ${logger.getLogFilePath()}`);
      }, 800);
    }
  });
});

app.on("window-all-closed", async () => {
  getSetupManager().abort();
  await backendManager.stop();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", async () => {
  getSetupManager().abort();
  await backendManager.stop();
  closeLogger();
});
