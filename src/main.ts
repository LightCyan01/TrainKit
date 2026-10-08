import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  session,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { getBackendManager, BackendManager } from "./backend-manager";
import { getSetupManager, type SetupProgress } from "./setup-manager";
import { getLogger, closeLogger } from "./logger";
import { ProviderSettingsStore, testProviderKey } from "./provider-settings";
import { isCloudProvider, type CloudProvider, type ProviderUpdate } from "./types/providers";
import { canonicalPath } from "./path-grants";
import { readImageOutput, sidecarPaths } from "./image-output";
import { isJobEvent, type ImageOutputKind, type JobEvent } from "./types/contracts";

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
const generatedOutputs: Record<ImageOutputKind, Map<string, string>> = { caption: new Map(), tag: new Map() };
const latestPreviewJobs = new Map<ImageOutputKind, JobEvent>();
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
let providerSettings: ProviderSettingsStore | null = null;

function getProviderSettings() {
  return providerSettings ??= new ProviderSettingsStore(path.join(app.getPath("userData"), "provider-settings.json"));
}

function trustedSender(event: IpcMainInvokeEvent, allowSplash = false) {
  const sender = event.sender;
  const trusted =
    mainWindow?.webContents === sender ||
    (allowSplash && splashWindow?.webContents === sender);
  if (!trusted) throw new Error("Rejected IPC from an untrusted renderer");
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
      preload: path.join(__dirname, "preload.cjs"),
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
      preload: path.join(__dirname, "preload.cjs"),
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
    if (splashWindow?.isMinimized()) {
      mainWindow?.showInactive();
      mainWindow?.minimize();
    } else {
      mainWindow?.show();
    }
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
  if (isJobEvent(event) && (event.operation === "caption" || event.operation === "tag")) {
    const outputs = generatedOutputs[event.operation];
    let latestJob = latestPreviewJobs.get(event.operation);
    if (!latestJob || event.created_at > latestJob.created_at) {
      latestJob = event;
      latestPreviewJobs.set(event.operation, latestJob);
      outputs.clear();
    }
    if (event.job_id === latestJob.job_id && event.preview_source && event.preview_output) {
      outputs.set(canonicalPath(event.preview_source), event.preview_output);
    }
  }
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
    if (request.path === "/caption" && request.method === "POST") {
      const body = request.body as Record<string, unknown>;
      if (isCloudProvider(body.provider)) {
        const key = getProviderSettings().key(body.provider);
        if (!key && !body.dry_run) throw new Error("Add this provider's API key in the API tab first.");
        return backendManager.request(request.path, request.method, request.body, key ? { "x-trainkit-provider-key": key } : {});
      }
    }
    return backendManager.request(request.path, request.method, request.body);
  },
);

ipcMain.handle("providers:get", (event) => {
  trustedSender(event);
  return getProviderSettings().status();
});
ipcMain.handle("providers:set", (event, provider: CloudProvider, update: ProviderUpdate) => {
  trustedSender(event);
  return getProviderSettings().set(provider, update);
});
ipcMain.handle("providers:remove", (event, provider: CloudProvider) => {
  trustedSender(event);
  return getProviderSettings().remove(provider);
});
ipcMain.handle("providers:test", async (event, provider: CloudProvider) => {
  trustedSender(event);
  if (!isCloudProvider(provider)) throw new Error("Unknown API provider.");
  await testProviderKey(provider, getProviderSettings().key(provider));
});

ipcMain.handle("window:minimize", (event) => {
  trustedSender(event, true);
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.handle("window:maximize", (event) => {
  trustedSender(event);
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle("window:close", (event) => {
  trustedSender(event, true);
  if (event.sender === splashWindow?.webContents) app.quit();
  else mainWindow?.close();
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
    return (await fs.promises.readdir(sourcePath, { withFileTypes: true }))
      .filter((file) => (file.isFile() || file.isSymbolicLink()) && IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
      .map((file) => path.join(sourcePath, file.name))
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
    if (!stats.isFile()) return null;
    if (stats.size > 1024 * 1024 && (process.platform === "win32" || process.platform === "darwin")) {
      try {
        // Keep large originals out of the renderer; Windows thumbnails only honor width.
        const thumbnail = await nativeImage.createThumbnailFromPath(imagePath, { width: 840, height: 840 });
        const size = thumbnail.getSize();
        const scale = Math.min(1, 840 / Math.max(size.width, size.height));
        if (!thumbnail.isEmpty()) {
          return (scale < 1 ? thumbnail.resize({
            width: Math.max(1, Math.round(size.width * scale)),
            height: Math.max(1, Math.round(size.height * scale)),
          }) : thumbnail).toDataURL();
        }
      } catch {
        // Some image formats have no system thumbnail provider.
      }
    }
    if (stats.size > IMAGE_PREVIEW_LIMIT) return null;
    const data = await fs.promises.readFile(imagePath);
    return `data:${MIME_TYPES[extension]};base64,${data.toString("base64")}`;
  } catch {
    return null;
  }
});

ipcMain.handle("fs:readImageOutput", async (event, imagePath: string, outputDirectory: string, kind: ImageOutputKind) => {
  trustedSender(event);
  if (typeof imagePath !== "string" || typeof outputDirectory !== "string" || (kind !== "caption" && kind !== "tag")) {
    throw new Error("Invalid preview request.");
  }
  if (!IMAGE_EXTENSIONS.has(path.extname(imagePath).toLowerCase()) || !isGranted(imagePath)) {
    throw new Error("Choose an image using the browse button.");
  }
  if (outputDirectory && !isGranted(outputDirectory)) throw new Error("Choose an output folder using the browse button.");
  const selectedImage = canonicalPath(imagePath);
  const adjacent = sidecarPaths(selectedImage, path.dirname(selectedImage), kind);
  const canRead = (candidate: string) => {
    if (isGranted(candidate)) return true;
    const resolved = canonicalPath(candidate);
    return adjacent.some(sidecar => path.relative(sidecar, resolved) === "");
  };
  const generated = generatedOutputs[kind].get(selectedImage);
  const matchingOutput = generated && outputDirectory &&
    canonicalPath(path.dirname(generated)) === canonicalPath(outputDirectory) ? generated : undefined;
  return readImageOutput(imagePath, outputDirectory, kind, canRead, matchingOutput);
});

async function initialize() {
  await createSplashWindow();
  const setup = getSetupManager();
  if (setup.isSetupRequired()) {
    splashWindow?.setSize(400, 600);
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
  const window = mainWindow ?? splashWindow;
  if (window?.isMinimized()) window.restore();
  window?.focus();
});
app.whenReady().then((): void => {
  if (!gotTheLock) return;
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setDevicePermissionHandler(() => false);
  void initialize().catch((error) => {
    getLogger().error("main", error instanceof Error ? error.message : String(error));
    splashWindow?.close();
    createWindow();
  });
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
