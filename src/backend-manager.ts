import { spawn, ChildProcess } from "child_process";
import path from "node:path";
import fs from "node:fs";
import { app, BrowserWindow } from "electron";
import { getLogger } from "./logger";

export type BackendStatus = "stopped" | "starting" | "running" | "error";

export interface BackendConfig {
  host?: string;
  port?: number;
}

export class BackendManager {
  private process: ChildProcess | null = null;
  private status: BackendStatus = "stopped";
  private config: Required<BackendConfig>;

  constructor(config: BackendConfig = {}) {
    this.config = {
      host: config.host ?? "127.0.0.1",
      port: config.port ?? 8000,
    };
  }

  async start(): Promise<void> {
    if (this.process) return;

    const logger = getLogger();
    this.status = "starting";
    logger.info("backend", "Starting backend...");

    const isDev = !app.isPackaged;
    
    const backendPath = isDev
      ? path.join(app.getAppPath(), "backend")
      : path.join(process.resourcesPath, "backend");

    logger.info("backend", `Backend path: ${backendPath}`);

    if (!fs.existsSync(backendPath)) {
      logger.error("backend", `Backend directory not found: ${backendPath}`);
      this.status = "error";
      return;
    }

    const venvPython =
      process.platform === "win32"
        ? path.join(backendPath, ".venv", "Scripts", "python.exe")
        : path.join(backendPath, ".venv", "bin", "python");

    if (!fs.existsSync(venvPython)) {
      logger.error("backend", `Python venv not found: ${venvPython}`);
      logger.error("backend", "Did the first-time setup complete successfully?");
      this.status = "error";
      return;
    }

    const pythonExe = venvPython;
    logger.info("backend", `Using Python: ${pythonExe}`);

    const args = [
      "-m",
      "fastapi",
      "run",
      "main.py",
      "--host",
      this.config.host,
      "--port",
      this.config.port.toString(),
    ];
    
    logger.info("backend", `Command: ${pythonExe} ${args.join(" ")}`);

    try {
      this.process = spawn(pythonExe, args, {
        cwd: backendPath,
        detached: false,
        stdio: "pipe",
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });

      this.setupListeners();
      logger.info("backend", `Backend process started with PID: ${this.process.pid}`);
    } catch (err) {
      const error = err as Error;
      logger.error("backend", `Failed to spawn backend process: ${error.message}`);
      this.status = "error";
    }
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    const logger = getLogger();
    logger.warning("backend", "Stopping backend...");

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.process?.kill("SIGKILL");
      }, 5000);

      this.process!.once("exit", () => {
        clearTimeout(timeout);
        this.process = null;
        this.status = "stopped";
        logger.info("backend", "Backend stopped");
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

  async waitForReady(intervalMs = 500): Promise<boolean> {
    const logger = getLogger();
    while (this.status === "starting" && this.process !== null) {
      if (await this.checkHealth()) {
        this.status = "running";
        logger.success("backend", "Backend is ready");
        return true;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    if (this.status === "error") {
      logger.error("backend", "Backend process exited with error");
    }
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
    const logger = getLogger();

    this.process.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          logger.info("python", line.trim());
        }
      }
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          if (trimmed.includes("ERROR") || trimmed.includes("CRITICAL") || trimmed.includes("Traceback")) {
            logger.error("python", trimmed);
          } else if (trimmed.includes("WARNING") || trimmed.includes("WARN")) {
            logger.warning("python", trimmed);
          } else {
            logger.info("python", trimmed);
          }
        }
      }
    });

    this.process.on("error", (err) => {
      this.status = "error";
      logger.error("backend", `Process error: ${err.message}`);
    });

    this.process.on("exit", (code, signal) => {
      if (code === 0 || code === null) {
        logger.info("backend", `Exited with code ${code}, signal ${signal}`);
        this.status = "stopped";
      } else {
        logger.error("backend", `Exited with code ${code}, signal ${signal}`);
        this.status = "error";
      }
      this.process = null;
    });
  }

  // Send logs to UI (call after window is ready)
  static sendLogsToUI(): void {
    const logger = getLogger();
    const windows = BrowserWindow.getAllWindows();
    
    // Add listener for future logs
    logger.addListener((entry) => {
      for (const win of windows) {
        win.webContents.send("main:log", {
          level: entry.level,
          message: entry.message,
          source: entry.source,
        });
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
