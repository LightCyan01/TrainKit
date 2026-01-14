import { spawn, ChildProcess } from "child_process";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

export type BackendStatus = "stopped" | "starting" | "running" | "error";

export interface BackendConfig {
  host?: string;
  port?: number;
  pythonPath?: string;
  debug?: boolean;
}

export class BackendManager {
  private process: ChildProcess | null = null;
  private status: BackendStatus = "stopped";
  private config: Required<BackendConfig>;

  constructor(config: BackendConfig = {}) {
    this.config = {
      host: config.host ?? "127.0.0.1",
      port: config.port ?? 8000,
      pythonPath: config.pythonPath ?? "python",
      debug: config.debug ?? false,
    };
  }

  async start(): Promise<void> {
    if (this.process) return;

    this.status = "starting";
    this.log("Starting backend...");

    const backendPath = path.join(app.getAppPath(), "backend");
    const venvPython =
      process.platform === "win32"
        ? path.join(backendPath, ".venv", "Scripts", "python.exe")
        : path.join(backendPath, ".venv", "bin", "python");

    const pythonExe = fs.existsSync(venvPython) ? venvPython : this.config.pythonPath;
    this.log(`Using Python: ${pythonExe}`);

    this.process = spawn(
      pythonExe,
      ["-m", "fastapi", "run", "main.py", "--host", this.config.host, "--port", this.config.port.toString()],
      {
        cwd: backendPath,
        detached: false,
        stdio: "pipe",
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      }
    );

    this.setupListeners();
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    this.log("Stopping backend...");

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.process?.kill("SIGKILL");
      }, 5000);

      this.process!.once("exit", () => {
        clearTimeout(timeout);
        this.process = null;
        this.status = "stopped";
        this.log("Backend stopped");
        resolve();
      });

      this.process!.kill();
    });
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getServerUrl()}/health`);
      const isHealthy = response.ok;
      if (isHealthy && this.status !== "running") {
        this.status = "running";
      }
      return isHealthy;
    } catch {
      return false;
    }
  }

  async waitForReady(timeoutMs = 30000, intervalMs = 200): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (await this.checkHealth()) {
        this.status = "running";
        return true;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    this.status = "error";
    return false;
  }

  getStatus(): BackendStatus {
    return this.status;
  }

  isRunning(): boolean {
    return this.status === "running" && this.process !== null;
  }

  getServerUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  private setupListeners(): void {
    if (!this.process) return;

    this.process.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) this.log(`[Backend] ${msg}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) this.log(`[Backend] ${msg}`);
    });

    this.process.on("error", (err) => {
      this.status = "error";
      console.error("[BackendManager] Process error:", err);
    });

    this.process.on("exit", (code, signal) => {
      this.log(`Exited with code ${code}, signal ${signal}`);
      this.status = code === 0 || code === null ? "stopped" : "error";
      this.process = null;
    });
  }

  private log(msg: string): void {
    if (this.config.debug) console.log(`[BackendManager] ${msg}`);
  }
}

// Singleton
let instance: BackendManager | null = null;

export function getBackendManager(config?: BackendConfig): BackendManager {
  if (!instance) instance = new BackendManager(config);
  return instance;
}

export function resetBackendManager(): void {
  instance = null;
}
