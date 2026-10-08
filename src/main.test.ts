import type { BrowserWindow } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { JobEvent } from "./types/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  return {
    windows: [] as BrowserWindow[],
    handlers: new Map<string, (event: { sender: object }, ...args: unknown[]) => unknown>(),
    dialog: { showOpenDialog: vi.fn() },
    thumbnail: vi.fn(),
    app: Object.assign(new EventEmitter(), {
      requestSingleInstanceLock: () => true,
      whenReady: async (): Promise<void> => undefined,
      getAppPath: () => "/test/app",
      getPath: () => "/test/user-data",
      getVersion: () => "1.3.0",
      quit: vi.fn(),
    }),
    backend: {
      onEvent: vi.fn(), onStatus: vi.fn(), start: vi.fn(),
      waitForReady: vi.fn<() => Promise<boolean>>(), stop: vi.fn(),
      getStatus: () => "running", getLastError: (): null => null,
    },
    setup: { isSetupRequired: vi.fn(), runSetup: vi.fn<() => Promise<boolean>>(), abort: vi.fn() },
    logger: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    closeLogger: vi.fn(),
    logCleanup: vi.fn(),
  };
});

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class Window extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { send: vi.fn(), setWindowOpenHandler: vi.fn() });
    minimized = false;
    minimize = vi.fn(() => { this.minimized = true; });
    isMinimized = () => this.minimized;
    show = vi.fn();
    showInactive = vi.fn();
    close = vi.fn(() => this.emit("closed"));
    setSize = vi.fn();
    center = vi.fn();
    loadFile = async (): Promise<void> => undefined;
    loadURL = async (): Promise<void> => undefined;
    constructor() {
      super();
      mocks.windows.push(this as unknown as BrowserWindow);
    }
    static fromWebContents(sender: object) { return mocks.windows.find(window => window.webContents === sender); }
    static getAllWindows() { return mocks.windows; }
  }
  return {
    app: mocks.app, BrowserWindow: Window,
    ipcMain: { handle: (channel: string, handler: (event: { sender: object }, ...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler) },
    session: { defaultSession: { setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn(), setDevicePermissionHandler: vi.fn() } },
    dialog: mocks.dialog, nativeImage: { createThumbnailFromPath: mocks.thumbnail }, shell: {}, safeStorage: {},
  };
});

describe("preview IPC", () => {
  let directory: string;
  let sender: object;
  const invoke = (channel: string, ...args: unknown[]) => mocks.handlers.get(channel)!({ sender }, ...args);
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.app.removeAllListeners();
    mocks.handlers.clear();
    mocks.windows.length = 0;
    mocks.setup.isSetupRequired.mockReturnValue(false);
    mocks.backend.start.mockResolvedValue(undefined);
    mocks.backend.waitForReady.mockResolvedValue(true);
    vi.stubGlobal("__dirname", "/test/build");
    vi.stubGlobal("MAIN_WINDOW_VITE_DEV_SERVER_URL", undefined);
    vi.stubGlobal("MAIN_WINDOW_VITE_NAME", "main_window");
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "trainkit-preview-"));
    await import("./main");
    await vi.waitFor(() => expect(mocks.windows).toHaveLength(2));
    sender = mocks.windows[1].webContents;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("allows only exact adjacent sidecars for an individually selected image", async () => {
    const image = path.join(directory, "image.png");
    fs.writeFileSync(image, "image");
    fs.writeFileSync(path.join(directory, "image.txt"), "Existing caption");
    mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [image] });
    await invoke("dialog:openFile");
    expect(await invoke("fs:readImageOutput", image, "", "caption")).toBe("Existing caption");
    await expect(invoke("fs:readImageOutput", path.join(directory, "other.png"), "", "caption")).rejects.toThrow("Choose an image");
    await expect(mocks.handlers.get("fs:readImageOutput")!({ sender: {} }, image, "", "caption")).rejects.toThrow("untrusted renderer");
  });

  it("rejects unapproved output folders and invalid output kinds", async () => {
    const image = path.join(directory, "image.png");
    fs.writeFileSync(image, "image");
    const output = path.join(directory, "output");
    fs.mkdirSync(output);
    mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [image] });
    await invoke("dialog:openFile");
    await expect(invoke("fs:readImageOutput", image, output, "tag")).rejects.toThrow("Choose an output folder");
    await expect(invoke("fs:readImageOutput", image, "", "other")).rejects.toThrow("Invalid preview request");
  });

  it("reads adjacent captions and tags through a junction without granting the whole folder", async () => {
    const selected = path.join(directory, "selected");
    const alias = path.join(directory, "alias");
    fs.mkdirSync(selected);
    fs.symlinkSync(selected, alias, process.platform === "win32" ? "junction" : "dir");
    try {
      const image = path.join(alias, "image.png");
      fs.writeFileSync(image, "image");
      fs.writeFileSync(path.join(alias, "image.txt"), "Existing caption");
      fs.writeFileSync(path.join(alias, "image.tags.txt"), "existing, tags");
      const otherImage = path.join(alias, "other.png");
      fs.writeFileSync(otherImage, "other image");
      fs.writeFileSync(path.join(alias, "other.txt"), "Other caption");
      mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [image] });
      await invoke("dialog:openFile");
      expect(await invoke("fs:readImageOutput", image, "", "caption")).toBe("Existing caption");
      expect(await invoke("fs:readImageOutput", image, "", "tag")).toBe("existing, tags");
      await expect(invoke("fs:readImageOutput", otherImage, "", "caption")).rejects.toThrow("Choose an image");
    } finally {
      fs.unlinkSync(alias);
    }
  });

  it("lists files in natural order without including directories named like images", async () => {
    fs.writeFileSync(path.join(directory, "image10.png"), "image");
    fs.writeFileSync(path.join(directory, "image2.png"), "image");
    fs.mkdirSync(path.join(directory, "fake.png"));
    mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [directory] });
    await invoke("dialog:openDirectory");
    expect(await invoke("fs:listImages", directory)).toEqual([path.join(directory, "image2.png"), path.join(directory, "image10.png")]);
  });

  it("uses generated renamed output only for its matching source and selected output folder", async () => {
    const source = path.join(directory, "image.png");
    const output = path.join(directory, "output");
    const otherOutput = path.join(directory, "other-output");
    fs.writeFileSync(source, "image");
    fs.mkdirSync(output); fs.mkdirSync(otherOutput);
    fs.writeFileSync(path.join(output, "image.txt"), "Old caption");
    fs.writeFileSync(path.join(output, "image_1.txt"), "New caption");
    fs.writeFileSync(path.join(otherOutput, "image.txt"), "Other folder");
    mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [directory] });
    await invoke("dialog:openDirectory");
    const { isJobEvent } = await import("./types/contracts");
    const event: JobEvent = {
      type: "job", job_id: "preview", operation: "caption", status: "running",
      current: 1, total: 1, percent: 100, message: "Captioned image.png", manifest_path: null, error: null,
      created_at: "2026-10-08T00:00:00Z", updated_at: "2026-10-08T00:00:01Z",
      preview_source: source, preview_output: path.join(output, "image_1.txt"),
    };
    expect(isJobEvent(event)).toBe(true);
    mocks.backend.onEvent.mock.calls[0][0](event);
    expect(await invoke("fs:readImageOutput", source, output, "caption")).toBe("New caption");
    expect(await invoke("fs:readImageOutput", source, otherOutput, "caption")).toBe("Other folder");
    mocks.backend.onEvent.mock.calls[0][0]({ ...event, status: "queued", preview_source: null, preview_output: null });
    expect(await invoke("fs:readImageOutput", source, output, "caption")).toBe("Old caption");
  });

  it.each(["caption", "tag"] as const)("uses renamed outputs through linked input folders for %s", async (operation) => {
    const selected = path.join(directory, "selected");
    const alias = path.join(directory, "alias");
    const output = path.join(directory, "output");
    fs.mkdirSync(selected); fs.mkdirSync(output);
    fs.symlinkSync(selected, alias, process.platform === "win32" ? "junction" : "dir");
    try {
      const image = path.join(alias, "image.png");
      const suffix = operation === "caption" ? ".txt" : ".tags.txt";
      const renamed = path.join(output, `image_1${suffix}`);
      fs.writeFileSync(image, "image");
      fs.writeFileSync(path.join(output, `image${suffix}`), "Old output");
      fs.writeFileSync(renamed, "New output");
      mocks.dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [alias] })
        .mockResolvedValueOnce({ canceled: false, filePaths: [output] });
      await invoke("dialog:openDirectory");
      await invoke("dialog:openDirectory");
      const event: JobEvent = {
        type: "job", job_id: "linked-preview", operation, status: "completed",
        current: 1, total: 1, percent: 100, message: "Saved output", manifest_path: null, error: null,
        created_at: "2026-10-08T00:00:00+00:00", updated_at: "2026-10-08T00:00:01+00:00",
        preview_source: fs.realpathSync.native(image), preview_output: renamed,
      };
      mocks.backend.onEvent.mock.calls[0][0](event);
      expect(await invoke("fs:readImageOutput", image, output, operation)).toBe("New output");
    } finally {
      fs.unlinkSync(alias);
    }
  });

  it("bounds tall system thumbnails and falls back to the original if no thumbnail provider is available", async () => {
    if (process.platform !== "win32" && process.platform !== "darwin") return;
    const image = path.join(directory, "large.png");
    fs.writeFileSync(image, Buffer.alloc(1024 * 1024 + 1));
    mocks.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [image] });
    await invoke("dialog:openFile");
    const resize = vi.fn(() => ({ toDataURL: () => "data:image/png;base64,thumbnail" }));
    mocks.thumbnail.mockResolvedValue({ getSize: () => ({ width: 840, height: 1680 }), isEmpty: () => false, resize });
    expect(await invoke("fs:readImageAsDataUrl", image)).toBe("data:image/png;base64,thumbnail");
    expect(resize).toHaveBeenCalledWith({ width: 420, height: 840 });
    mocks.thumbnail.mockRejectedValue(new Error("No thumbnail provider"));
    const fallback = await invoke("fs:readImageAsDataUrl", image) as string;
    expect(fallback).toBe(`data:image/png;base64,${fs.readFileSync(image).toString("base64")}`);
  });
});
vi.mock("./backend-manager", () => ({
  getBackendManager: () => mocks.backend,
  BackendManager: { sendLogsToUI: () => mocks.logCleanup },
}));
vi.mock("./setup-manager", () => ({ getSetupManager: () => mocks.setup }));
vi.mock("./logger", () => ({ getLogger: () => mocks.logger, closeLogger: mocks.closeLogger }));

describe("startup window controls", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.app.removeAllListeners();
    mocks.handlers.clear();
    mocks.windows.length = 0;
    mocks.setup.isSetupRequired.mockReturnValue(true);
    mocks.setup.runSetup.mockImplementation(() => new Promise<boolean>(() => {}));
    mocks.backend.start.mockResolvedValue(undefined);
    mocks.backend.stop.mockResolvedValue(undefined);
    mocks.backend.waitForReady.mockResolvedValue(true);
    vi.stubGlobal("__dirname", "/test/build");
    vi.stubGlobal("MAIN_WINDOW_VITE_DEV_SERVER_URL", undefined);
    vi.stubGlobal("MAIN_WINDOW_VITE_NAME", "main_window");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("minimizes the splash renderer's own window during setup", async () => {
    await import("./main");
    await vi.waitFor(() => expect(mocks.setup.runSetup).toHaveBeenCalledOnce());
    const splash = mocks.windows[0];
    mocks.handlers.get("window:minimize")!({ sender: splash.webContents });
    expect(splash.minimize).toHaveBeenCalledOnce();
    expect(splash.isMinimized()).toBe(true);
  });

  it("quits from the splash and aborts setup through before-quit", async () => {
    await import("./main");
    await vi.waitFor(() => expect(mocks.setup.runSetup).toHaveBeenCalledOnce());
    const splash = mocks.windows[0];
    mocks.handlers.get("window:close")!({ sender: splash.webContents });
    expect(mocks.app.quit).toHaveBeenCalledOnce();
    expect(splash.close).not.toHaveBeenCalled();

    const event = { preventDefault: vi.fn() };
    mocks.app.emit("before-quit", event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(mocks.setup.abort).toHaveBeenCalledOnce();
    expect(mocks.backend.stop).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalledTimes(2));
    expect(mocks.closeLogger).toHaveBeenCalledOnce();
  });

  it("keeps the main window minimized when it replaces a minimized splash", async () => {
    mocks.setup.isSetupRequired.mockReturnValue(false);
    let finishBackend: (ready: boolean) => void = () => {};
    mocks.backend.waitForReady.mockImplementation(() => new Promise(resolve => { finishBackend = resolve; }));
    await import("./main");
    await vi.waitFor(() => expect(mocks.backend.waitForReady).toHaveBeenCalledOnce());
    const splash = mocks.windows[0];
    mocks.handlers.get("window:minimize")!({ sender: splash.webContents });
    finishBackend(true);
    await vi.waitFor(() => expect(mocks.windows).toHaveLength(2));

    const main = mocks.windows[1];
    main.emit("ready-to-show");
    expect(main.showInactive).toHaveBeenCalledOnce();
    expect(main.minimize).toHaveBeenCalledOnce();
    expect(main.isMinimized()).toBe(true);
    expect(main.show).not.toHaveBeenCalled();
    expect(splash.close).toHaveBeenCalledOnce();
  });
});
