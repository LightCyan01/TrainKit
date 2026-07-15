import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { app, BrowserWindow } from "electron";
import WebSocket from "ws";
import { getLogger } from "./logger";
import { getRuntimePaths } from "./runtime-paths";
import { isJobEvent, isLogEvent, type BackendEvent } from "./types/contracts";

export type BackendStatus = "stopped" | "starting" | "running" | "error";

export interface BackendConfig {
  host?: string;
  startupTimeoutMs?: number;
}

export interface BackendResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

type EventListener = (event: BackendEvent) => void;
type StatusListener = (status: BackendStatus) => void;

const DESKTOP_ORIGIN = "trainkit://desktop";
const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE"]);
const ALLOWED_PATH = /^\/(?:health|device|capabilities|jobs(?:\/[a-f0-9]+)?|cancel|caption|preload|model-status|unload|upscale|upscale-model-info|rename|tag)$/;

export class BackendManager {
  private process: ChildProcess | null = null;
  private status: BackendStatus = "stopped";
  private readonly host: string;
  private readonly startupTimeoutMs: number;
  private port = 0;
  private token = "";
  private eventSocket: WebSocket | null = null;
  private eventReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventListeners = new Set<EventListener>();
  private statusListeners = new Set<StatusListener>();
  private lastError: string | null = null;

  constructor(config: BackendConfig = {}) {
    this.host = config.host ?? "127.0.0.1";
    this.startupTimeoutMs = config.startupTimeoutMs ?? 180_000;
  }

  async start(): Promise<void> {
    if (this.process) return;
    const logger = getLogger();
    this.lastError = null;
    this.setStatus("starting");
    this.port = await this.findAvailablePort();
    this.token = randomBytes(32).toString("hex");

    const paths = getRuntimePaths();
    const backendPath = paths.backendPath;
    if (!fs.existsSync(backendPath)) {
      this.lastError = `Backend directory not found: ${backendPath}`;
      this.setStatus("error");
      throw new Error(this.lastError);
    }

    const runtimePath = paths.runtimePath;
    const python =
      process.platform === "win32"
        ? path.join(runtimePath, ".venv", "Scripts", "python.exe")
        : path.join(runtimePath, ".venv", "bin", "python");
    if (!fs.existsSync(python)) {
      this.lastError = `Python environment not found: ${python}`;
      this.setStatus("error");
      throw new Error(this.lastError);
    }

    fs.mkdirSync(paths.modelCachePath, { recursive: true });

    const args = [
      "-m",
      "uvicorn",
      "main:app",
      "--host",
      this.host,
      "--port",
      String(this.port),
      "--no-server-header",
    ];
    logger.info("backend", `Starting authenticated backend on ${this.host}:${this.port}`);
    logger.info("backend", `Backend source: ${backendPath}`);
    logger.info("backend", `Python environment: ${path.dirname(path.dirname(python))}`);
    this.process = spawn(python, args, {
      cwd: backendPath,
      detached: false,
      stdio: "pipe",
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        PYTHONUNBUFFERED: "1",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        HF_HOME: path.join(paths.modelCachePath, "huggingface"),
        HF_HUB_CACHE: path.join(paths.modelCachePath, "huggingface", "hub"),
        TORCH_HOME: path.join(paths.modelCachePath, "torch"),
        XDG_CACHE_HOME: paths.modelCachePath,
        TRAINKIT_BACKEND_TOKEN: this.token,
        TRAINKIT_DESKTOP_ORIGIN: DESKTOP_ORIGIN,
        TRAINKIT_VERSION: app.getVersion(),
      },
    });
    this.setupListeners();
  }

  async stop(): Promise<void> {
    this.setStatus("stopped");
    this.closeEventSocket();
    const child = this.process;
    if (!child) {
      this.setStatus("stopped");
      return;
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill();
    });
    this.process = null;
    this.setStatus("stopped");
  }

  async checkHealth(): Promise<boolean> {
    if (!this.token || !this.port) return false;
    try {
      const response = await fetch(`${this.getServerUrl()}/health`, {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) return false;
      const body = (await response.json()) as { status?: string; version?: string };
      return body.status === "ok" && body.version === app.getVersion();
    } catch {
      return false;
    }
  }

  async waitForReady(): Promise<boolean> {
    const deadline = Date.now() + this.startupTimeoutMs;
    while (
      Date.now() < deadline &&
      this.status === "starting" &&
      this.process !== null
    ) {
      if (await this.checkHealth()) {
        this.setStatus("running");
        this.connectEventSocket();
        getLogger().success("backend", "Backend is ready");
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (this.status === "starting") {
      if (await this.checkHealth()) {
        this.setStatus("running");
        this.connectEventSocket();
        getLogger().success("backend", "Backend is ready");
        return true;
      }
      this.lastError = `Backend did not become ready within ${Math.ceil(this.startupTimeoutMs / 1000)} seconds`;
      getLogger().error("backend", this.lastError);
      this.setStatus("error");
      this.process?.kill();
    }
    return false;
  }

  async request<T = unknown>(
    requestPath: string,
    method = "GET",
    body?: unknown,
  ): Promise<BackendResponse<T>> {
    const normalizedMethod = method.toUpperCase();
    if (!ALLOWED_METHODS.has(normalizedMethod) || !ALLOWED_PATH.test(requestPath)) {
      throw new Error("Backend request is outside the allowed API surface");
    }
    if (!this.isRunning()) throw new Error("Backend is not running");
    const response = await fetch(`${this.getServerUrl()}${requestPath}`, {
      method: normalizedMethod,
      headers: {
        ...this.authHeaders(),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(
        requestPath === "/preload" || requestPath === "/upscale-model-info"
          ? 10 * 60_000
          : 30_000,
      ),
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: { code: "invalid_response", message: text } };
      }
    }
    return { ok: response.ok, status: response.status, data: data as T };
  }

  getStatus(): BackendStatus {
    return this.status;
  }

  isRunning(): boolean {
    return this.status === "running" && this.process !== null;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: BackendStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  private getServerUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  private authHeaders(): Record<string, string> {
    return { "x-trainkit-token": this.token };
  }

  private async findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.on("error", reject);
      server.listen(0, this.host, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Could not allocate a backend port"));
          return;
        }
        const selected = address.port;
        server.close((error) => (error ? reject(error) : resolve(selected)));
      });
    });
  }

  private connectEventSocket() {
    this.closeEventSocket();
    const url = this.getServerUrl().replace("http://", "ws://") + "/ws/events";
    const socket = new WebSocket(url, {
      origin: DESKTOP_ORIGIN,
      headers: this.authHeaders(),
    });
    this.eventSocket = socket;
    socket.on("message", (payload) => {
      try {
        const event: unknown = JSON.parse(payload.toString());
        if (!isJobEvent(event) && !isLogEvent(event)) {
          throw new Error("event does not match the backend contract");
        }
        for (const listener of this.eventListeners) listener(event);
      } catch (error) {
        getLogger().warning("backend", `Ignored invalid backend event: ${String(error)}`);
      }
    });
    socket.on("error", (error) => {
      getLogger().warning("backend", `Event stream error: ${error.message}`);
    });
    socket.on("close", () => {
      if (this.eventSocket === socket) {
        this.eventSocket = null;
        if (this.isRunning() && !this.eventReconnectTimer) {
          this.eventReconnectTimer = setTimeout(() => {
            this.eventReconnectTimer = null;
            if (this.isRunning()) this.connectEventSocket();
          }, 1_000);
        }
      }
    });
  }

  private closeEventSocket() {
    if (this.eventReconnectTimer) clearTimeout(this.eventReconnectTimer);
    this.eventReconnectTimer = null;
    this.eventSocket?.close();
    this.eventSocket = null;
  }

  private setupListeners(): void {
    if (!this.process) return;
    const child = this.process;
    const logger = getLogger();
    child.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().trim().split("\n")) {
        if (line.trim()) logger.info("python", line.trim());
      }
    });
    child.stderr?.on("data", (data: Buffer) => {
      for (const line of data.toString().trim().split("\n")) {
        const value = line.trim();
        if (!value) continue;
        if (/ERROR|CRITICAL|Traceback/.test(value)) logger.error("python", value);
        else if (/WARNING|WARN/.test(value)) logger.warning("python", value);
        else logger.info("python", value);
      }
    });
    child.on("error", (error) => {
      this.lastError = `Backend process error: ${error.message}`;
      logger.error("backend", `Process error: ${error.message}`);
      this.setStatus("error");
    });
    child.on("exit", (code, signal) => {
      logger[code === 0 ? "info" : "error"](
        "backend",
        `Exited with code ${code}, signal ${signal}`,
      );
      this.closeEventSocket();
      this.process = null;
      if (this.status === "stopped") return;
      if (this.status !== "error") {
        this.lastError = `Backend exited before shutdown (code ${code}, signal ${signal})`;
      }
      this.setStatus("error");
    });
  }

  static sendLogsToUI(): () => void {
    return getLogger().addListener((entry) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send("main:log", {
            timestamp: entry.timestamp,
            level: entry.level,
            message: entry.message,
            source: entry.source,
          });
        }
      }
    });
  }
}

let instance: BackendManager | null = null;

export function getBackendManager(config?: BackendConfig): BackendManager {
  if (!instance) instance = new BackendManager(config);
  return instance;
}

export function resetBackendManager(): void {
  instance = null;
}
