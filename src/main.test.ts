import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  return {
    windows: [] as BrowserWindow[],
    handlers: new Map<string, (event: { sender: object }) => unknown>(),
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
    ipcMain: { handle: (channel: string, handler: (event: { sender: object }) => unknown) => mocks.handlers.set(channel, handler) },
    session: { defaultSession: { setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn(), setDevicePermissionHandler: vi.fn() } },
    dialog: {}, shell: {}, safeStorage: {},
  };
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
