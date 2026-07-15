import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { getBackendManager, BackendManager } from "./backend-manager";
import { getSetupManager, type SetupProgress } from "./setup-manager";
import { getLogger, closeLogger } from "./logger";

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();

const backendManager = getBackendManager({ host: "127.0.0.1" });
const grantedRoots = new Set<string>();
const grantedFiles = new Set<string>();
const EXTERNAL_HOSTS = new Set([
  "github.com",
  "docs.astral.sh",
  "aka.ms",
  "huggingface.co",
]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);
const MODEL_EXTENSIONS = new Set([".safetensors", ".param", ".bin"]);
const IMAGE_PREVIEW_LIMIT = 32 * 1024 * 1024;
const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};
const BACKEND_PATH_FIELDS: Record<string, string[]> = {
  "/caption": [
    "caption_model_path",
    "load_path",
    "save_path",
    "resume_manifest_path",
  ],
  "/preload": ["model_path"],
  "/model-status": ["model_path"],
  "/upscale": [
    "upscale_model_path",
    "ncnn_model_bin_path",
    "load_path",
    "save_path",
    "resume_manifest_path",
  ],
  "/upscale-model-info": ["model_path", "model_bin_path"],
  "/rename": ["load_path", "save_path", "resume_manifest_path"],
  "/tag": [
    "tag_model_path",
    "load_path",
    "save_path",
    "resume_manifest_path",
  ],
};

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let logCleanup: (() => void) | null = null;
let quitting = false;

function trustedSender(event: IpcMainInvokeEvent, allowSplash = false) {
  const sender = event.sender;
  const trusted =
    mainWindow?.webContents === sender ||
    (allowSplash && splashWindow?.webContents === sender);
  if (!trusted) throw new Error("Rejected IPC from an untrusted renderer");
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function grantRoot(value: string): string {
  const canonical = canonicalPath(value);
  grantedRoots.add(canonical);
  return canonical;
}

function grantFile(value: string): string {
  const canonical = canonicalPath(value);
  grantedFiles.add(canonical);
  return canonical;
}

function isGranted(value: string): boolean {
  const candidate = canonicalPath(value);
  if (grantedFiles.has(candidate)) return true;
  for (const root of grantedRoots) {
    const relative = path.relative(root, candidate);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
      return true;
    }
  }
  return false;
}

function validateBackendPaths(requestPath: string, body: unknown) {
  const fields = BACKEND_PATH_FIELDS[requestPath];
  if (!fields) return;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Backend request body must be an object");
  }
  const values = body as Record<string, unknown>;
  for (const field of fields) {
    const value = values[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || !isGranted(value)) {
      throw new Error(`Backend path is outside the user's grants: ${field}`);
    }
  }
}

function installNavigationGuards(window: BrowserWindow) {
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openAllowedExternal(url).catch((error) =>
      getLogger().warning("security", String(error)),
    );
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, target) => {
    const current = window.webContents.getURL();
    try {
      const targetUrl = new URL(target);
      const currentUrl = current ? new URL(current) : null;
      const sameDevelopmentOrigin =
        targetUrl.protocol === "http:" &&
        currentUrl?.protocol === "http:" &&
        targetUrl.origin === currentUrl.origin;
      const samePackagedDocument =
        targetUrl.protocol === "file:" &&
        currentUrl?.protocol === "file:" &&
        targetUrl.pathname === currentUrl.pathname;
      if (!samePackagedDocument && !sameDevelopmentOrigin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });
}

async function openAllowedExternal(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || !EXTERNAL_HOSTS.has(url.hostname)) {
    throw new Error(`External URL is not allowlisted: ${rawUrl}`);
  }
  await shell.openExternal(url.toString());
}

async function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 320,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  installNavigationGuards(splashWindow);
  const splashPath = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? path.join(app.getAppPath(), "src", "splash.html")
    : path.join(__dirname, "splash.html");
  splashWindow.once("ready-to-show", () => splashWindow?.show());
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
  await splashWindow.loadFile(splashPath);
}

function createWindow() {
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
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  installNavigationGuards(mainWindow);
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    mainWindow?.focus();
    splashWindow?.close();
  });
  mainWindow.webContents.once("did-finish-load", () => {
    const status = backendManager.getStatus();
    mainWindow?.webContents.send("backend:status-changed", {
      status,
      isRunning: status === "running",
      error: backendManager.getLastError(),
    });
    if (status === "running") mainWindow?.webContents.send("backend:ready");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function updateSplashStatus(status: string) {
  splashWindow?.webContents.send("splash:status", status);
}

function sendSetupProgress(progress: SetupProgress) {
  splashWindow?.webContents.send("setup:progress", progress);
}

backendManager.onEvent((event) => {
  mainWindow?.webContents.send("backend:event", event);
});
backendManager.onStatus((status) => {
  mainWindow?.webContents.send("backend:status-changed", {
    status,
    isRunning: status === "running",
    error: backendManager.getLastError(),
  });
});

ipcMain.handle("backend:status", (event) => {
  trustedSender(event, true);
  const status = backendManager.getStatus();
  return {
    status,
    isRunning: status === "running",
    version: app.getVersion(),
    error: backendManager.getLastError(),
  };
});
ipcMain.handle(
  "backend:request",
  async (
    event,
    request: { path: string; method?: string; body?: unknown },
  ) => {
    trustedSender(event);
    if (!request || typeof request.path !== "string") {
      throw new Error("Invalid backend request");
    }
    validateBackendPaths(request.path, request.body);
    return backendManager.request(request.path, request.method, request.body);
  },
);

ipcMain.handle("window:minimize", (event) => {
  trustedSender(event, true);
  mainWindow?.minimize();
});
ipcMain.handle("window:maximize", (event) => {
  trustedSender(event);
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle("window:close", (event) => {
  trustedSender(event, true);
  if (mainWindow) mainWindow.close();
  else splashWindow?.close();
});
ipcMain.handle("window:isMaximized", (event) => {
  trustedSender(event);
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle("shell:openExternal", async (event, url: string) => {
  trustedSender(event);
  await openAllowedExternal(url);
});
ipcMain.handle("log:openFile", async (event) => {
  trustedSender(event);
  const error = await shell.openPath(getLogger().getLogFilePath());
  if (error) throw new Error(error);
});
ipcMain.handle("log:openFolder", async (event) => {
  trustedSender(event);
  const error = await shell.openPath(getLogger().getLogsDir());
  if (error) throw new Error(error);
});
ipcMain.handle("log:getPath", (event) => {
  trustedSender(event);
  return getLogger().getLogFilePath();
});
ipcMain.handle("log:getEntries", (event) => {
  trustedSender(event);
  return getLogger().getEntries();
});

ipcMain.handle("dialog:openDirectory", async (event) => {
  trustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled || !result.filePaths[0] ? null : grantRoot(result.filePaths[0]);
});
ipcMain.handle(
  "dialog:openFile",
  async (
    event,
    options?: { filters?: { name: string; extensions: string[] }[] },
  ) => {
    trustedSender(event);
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openFile"],
      filters: options?.filters ?? [{ name: "All Files", extensions: ["*"] }],
    });
    return result.canceled || !result.filePaths[0] ? null : grantFile(result.filePaths[0]);
  },
);

ipcMain.handle("fs:pathExists", async (event, value: string) => {
  trustedSender(event);
  if (!isGranted(value)) return false;
  try {
    await fs.promises.access(value, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("fs:isValidModel", async (event, modelPath: string) => {
  trustedSender(event);
  if (!isGranted(modelPath)) return { valid: false };
  try {
    const stats = await fs.promises.stat(modelPath);
    const extension = path.extname(modelPath).toLowerCase();
    return stats.isFile() && MODEL_EXTENSIONS.has(extension)
      ? { valid: true, name: path.basename(modelPath), size: stats.size }
      : { valid: false };
  } catch {
    return { valid: false };
  }
});
ipcMain.handle("fs:isValidModelFolder", async (event, folderPath: string) => {
  trustedSender(event);
  if (!isGranted(folderPath)) return { valid: false };
  try {
    const stats = await fs.promises.stat(folderPath);
    const config = path.join(folderPath, "config.json");
    await fs.promises.access(config, fs.constants.R_OK);
    return stats.isDirectory()
      ? { valid: true, name: path.basename(folderPath) }
      : { valid: false };
  } catch {
    return { valid: false };
  }
});
ipcMain.handle("fs:listImages", async (event, sourcePath: string) => {
  trustedSender(event);
  if (!isGranted(sourcePath)) return [];
  try {
    const stats = await fs.promises.stat(sourcePath);
    if (stats.isFile()) {
      return IMAGE_EXTENSIONS.has(path.extname(sourcePath).toLowerCase())
        ? [sourcePath]
        : [];
    }
    if (!stats.isDirectory()) return [];
    return (await fs.promises.readdir(sourcePath))
      .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .map((file) => path.join(sourcePath, file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  } catch {
    return [];
  }
});
ipcMain.handle("fs:readImageAsDataUrl", async (event, imagePath: string) => {
  trustedSender(event);
  if (!isGranted(imagePath)) return null;
  const extension = path.extname(imagePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) return null;
  try {
    const stats = await fs.promises.stat(imagePath);
    if (!stats.isFile() || stats.size > IMAGE_PREVIEW_LIMIT) return null;
    const data = await fs.promises.readFile(imagePath);
    return `data:${MIME_TYPES[extension]};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
});

async function initialize() {
  await createSplashWindow();
  const setup = getSetupManager();
  if (setup.isSetupRequired()) {
    splashWindow?.setSize(400, 500);
    splashWindow?.center();
    splashWindow?.webContents.send("setup:mode");
    updateSplashStatus("First-time setup...");
    const success = await setup.runSetup((progress) => {
      sendSetupProgress(progress);
      const level = progress.status === "error" ? "error" : progress.status === "complete" ? "success" : "info";
      if (progress.message) getLogger()[level]("setup", progress.message);
    });
    if (!success) {
      updateSplashStatus("Setup failed");
      return;
    }
  }

  updateSplashStatus("Starting backend...");
  try {
    await backendManager.start();
    updateSplashStatus("Waiting for backend...");
    const ready = await backendManager.waitForReady();
    updateSplashStatus(ready ? "Loading interface..." : "Backend failed to start");
  } catch (error) {
    updateSplashStatus("Backend failed to start");
    getLogger().error("main", error instanceof Error ? error.message : String(error));
  }
  logCleanup = BackendManager.sendLogsToUI();
  createWindow();
}

app.on("second-instance", () => {
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.focus();
});
app.whenReady().then((): void => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setDevicePermissionHandler(() => false);
  void initialize();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  getSetupManager().abort();
  void backendManager.stop().finally(() => {
    logCleanup?.();
    closeLogger();
    app.quit();
  });
});
