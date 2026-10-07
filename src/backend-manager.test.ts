import { EventEmitter } from "node:events";
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendManager } from "./backend-manager";
import type { JobRecord } from "./types/contracts";

const mocks = vi.hoisted(() => ({
  sockets: [] as EventEmitter[],
  children: [] as (EventEmitter & { kill: () => boolean })[],
  logger: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("electron", () => ({ app: { getVersion: () => "test" }, BrowserWindow: {} }));
vi.mock("./logger", () => ({ getLogger: () => mocks.logger }));
vi.mock("./runtime-paths", () => ({
  getRuntimePaths: () => ({ backendPath: "backend", runtimePath: "runtime", modelCachePath: "cache" }),
}));
vi.mock("node:fs", () => ({ default: { existsSync: () => true, mkdirSync: vi.fn() } }));
vi.mock("node:net", () => ({
  createServer: () => ({
    unref: vi.fn(),
    on: vi.fn(),
    listen: (_port: number, _host: string, callback: () => void) => callback(),
    address: () => ({ port: 12345 }),
    close: (callback: () => void) => callback(),
  }),
}));
vi.mock("node:child_process", () => ({
  spawn: () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true),
    });
    mocks.children.push(child);
    return child;
  },
}));
vi.mock("ws", async () => {
  const { EventEmitter: SocketEvents } = await import("node:events");
  return { default: class extends SocketEvents {
    constructor() {
      super();
      mocks.sockets.push(this);
    }
    close() { this.emit("close"); }
  } };
});

const runningJob: JobRecord = {
  job_id: "abc",
  operation: "caption",
  status: "running",
  current: 0,
  total: 1,
  percent: 0,
  message: "working",
  manifest_path: null,
  error: null,
  created_at: "2026-07-14T00:00:00.000001+00:00",
  updated_at: "2026-07-14T00:00:01.000001+00:00",
};

describe("backend request and event recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sockets.length = 0;
    mocks.children.length = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      const data = url.endsWith("/health") ? { status: "ok", version: "test" } : { jobs: [runningJob] };
      return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function readyManager() {
    const manager = new BackendManager();
    await manager.start();
    expect(await manager.waitForReady()).toBe(true);
    return manager;
  }

  it("forwards an internal provider key while preserving its own authentication token", async () => {
    const manager = await readyManager();
    const headers = { "x-trainkit-provider-key": "test-key", "X-Trainkit-Token": "untrusted" };
    await manager.request("/caption", "POST", {}, headers);
    const request = vi.mocked(fetch).mock.calls.at(-1)?.[1];
    const sentHeaders = new Headers(request?.headers);
    expect(sentHeaders.get("x-trainkit-provider-key")).toBe("test-key");
    expect(sentHeaders.get("content-type")).toBe("application/json");
    expect(sentHeaders.get("x-trainkit-token")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("recovers current jobs on the initial socket and after a reconnect", async () => {
    vi.useFakeTimers();
    const manager = await readyManager();
    const listener = vi.fn();
    manager.onEvent(listener);
    mocks.sockets[0].emit("open");
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenCalledWith({ type: "job", ...runningJob });

    const completed = { ...runningJob, status: "completed", updated_at: "2026-07-14T00:00:02.000001+00:00" };
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify({ jobs: [completed, { status: "invalid" }] }),
    } as Response);
    mocks.sockets[0].emit("close");
    await vi.advanceTimersByTimeAsync(1_000);
    mocks.sockets[1].emit("open");
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).toHaveBeenLastCalledWith({ type: "job", ...completed });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("can stop after a failed spawn has closed without emitting exit", async () => {
    vi.useFakeTimers();
    const manager = new BackendManager();
    await manager.start();
    const child = mocks.children[0];
    child.emit("error", new Error("spawn rejected"));
    child.emit("close", -1, null);
    expect(manager.getStatus()).toBe("error");
    expect(manager.getLastError()).toBe("Backend process error: spawn rejected");
    const stopped = vi.fn();
    void manager.stop().then(stopped);
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toHaveBeenCalledOnce();
    expect(child.kill).not.toHaveBeenCalled();
    expect(manager.getLastError()).toBe("Backend process error: spawn rejected");
  });

  it("finishes shutdown if a failed child closes while stop is waiting", async () => {
    vi.useFakeTimers();
    const manager = new BackendManager();
    await manager.start();
    const child = mocks.children[0];
    child.emit("error", new Error("spawn rejected"));
    const stopped = vi.fn();
    void manager.stop().then(stopped);
    child.emit("close", -1, null);
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toHaveBeenCalledOnce();
    expect(manager.getLastError()).toBe("Backend process error: spawn rejected");
  });

  it("reports a cache-directory failure as a startup error", async () => {
    vi.mocked(fs.mkdirSync).mockImplementationOnce(() => { throw new Error("cache permission denied"); });
    const manager = new BackendManager();
    await expect(manager.start()).rejects.toThrow("cache permission denied");
    expect(manager.getStatus()).toBe("error");
    expect(manager.getLastError()).toBe("cache permission denied");
    expect(mocks.children).toHaveLength(0);
  });
});
