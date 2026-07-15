import { spawn, execFile, type ChildProcess } from "child_process";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { app } from "electron";
import { getRuntimePaths } from "./runtime-paths";

export type SetupStatus =
  | "checking"
  | "downloading"
  | "installing"
  | "complete"
  | "error";

export interface SetupProgress {
  status: SetupStatus;
  message: string;
  progress?: number;
}

export class SetupManager {
  private backendPath: string;
  private runtimePath: string;
  private currentProcess: ChildProcess | null = null;
  private isAborting = false;

  constructor() {
    const paths = getRuntimePaths();
    this.backendPath = paths.backendPath;
    this.runtimePath = paths.runtimePath;
  }

  isSetupRequired(): boolean {
    const venvPath = path.join(this.runtimePath, ".venv");
    const markerPath = path.join(this.runtimePath, ".setup_complete.json");
    if (!fs.existsSync(venvPath) || !fs.existsSync(markerPath)) return true;
    try {
      const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as {
        version?: string;
        lockHash?: string;
      };
      return marker.version !== app.getVersion() || marker.lockHash !== this.lockHash();
    } catch {
      return true;
    }
  }

  getBackendPath(): string {
    return this.backendPath;
  }

  getRuntimePath(): string {
    return this.runtimePath;
  }

  abort(): void {
    this.isAborting = true;
    if (this.currentProcess && this.currentProcess.pid) {
      if (process.platform === "win32") {
        execFile(
          "taskkill",
          ["/pid", String(this.currentProcess.pid), "/T", "/F"],
          () => {},
        );
      } else {
        this.currentProcess.kill("SIGKILL");
      }
      this.currentProcess = null;
    }
  }

  async runSetup(
    onProgress: (progress: SetupProgress) => void,
  ): Promise<boolean> {
    this.isAborting = false;

    try {
      if (this.isAborting) return false;

      onProgress({ status: "checking", message: "Checking prerequisites..." });
      onProgress({
        status: "checking",
        message: `Dependency location: ${this.runtimePath}`,
      });
      this.ensureRuntimeIsWritable();
      const hasUv = await this.checkUvInstalled();
      const hasVcpp = await this.checkVcppInstalled();

      let hasMissingPrereqs = false;

      if (!hasUv) {
        onProgress({ status: "error", message: "uv is not installed" });
        onProgress({ status: "error", message: "Please install uv from:" });
        onProgress({
          status: "error",
          message: "https://docs.astral.sh/uv/getting-started/installation/",
        });
        hasMissingPrereqs = true;
      }

      if (!hasVcpp) {
        if (hasMissingPrereqs) {
          onProgress({ status: "error", message: "" });
        }
        onProgress({
          status: "error",
          message: "Microsoft Visual C++ Redistributable is not installed",
        });
        onProgress({ status: "error", message: "Please install from:" });
        onProgress({
          status: "error",
          message: "https://aka.ms/vs/17/release/vc_redist.x64.exe",
        });
        hasMissingPrereqs = true;
      }

      if (hasMissingPrereqs) {
        onProgress({ status: "error", message: "" });
        onProgress({
          status: "error",
          message: "After installing, restart TrainKit",
        });
        return false;
      }

      if (this.isAborting) return false;

      const venvPath = path.join(this.runtimePath, ".venv");
      const markerPath = path.join(this.runtimePath, ".setup_complete.json");
      fs.mkdirSync(this.runtimePath, { recursive: true });
      const paths = getRuntimePaths();
      fs.mkdirSync(paths.setupCachePath, { recursive: true });
      fs.mkdirSync(paths.temporaryPath, { recursive: true });

      if (this.isAborting) return false;

      onProgress({
        status: "installing",
        message: "Installing dependencies (this may take a few minutes)...",
      });
      await this.runCommand(
        "uv",
        ["sync", "--project", this.backendPath, "--locked", "--no-dev"],
        this.backendPath,
        onProgress,
        venvPath,
      );

      if (this.isAborting) return false;

      this.cleanSetupArtifacts(onProgress);

      fs.writeFileSync(
        markerPath,
        JSON.stringify(
          {
            version: app.getVersion(),
            lockHash: this.lockHash(),
            completedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      );

      this.cleanLegacyRuntime(onProgress);

      onProgress({ status: "complete", message: "Setup complete!" });
      return true;
    } catch (error) {
      if (this.isAborting) {
        return false;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      onProgress({ status: "error", message: `Setup failed: ${message}` });
      return false;
    }
  }

  private async checkUvInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile("uv", ["--version"], (error) => {
        resolve(!error);
      });
    });
  }

  private async checkVcppInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      if (process.platform !== "win32") {
        resolve(true);
        return;
      }
      execFile(
        "reg",
        [
          "query",
          "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64",
          "/v",
          "Version",
        ],
        (error) => {
          if (!error) {
            resolve(true);
            return;
          }
          const vcDll = path.join(
            process.env.SystemRoot || "C:\\Windows",
            "System32",
            "vcruntime140.dll",
          );
          resolve(fs.existsSync(vcDll));
        },
      );
    });
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    onProgress: (progress: SetupProgress) => void,
    venvPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const paths = getRuntimePaths();
      const proc = spawn(command, args, {
        cwd,
        stdio: "pipe",
        shell: false,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          UV_PROJECT_ENVIRONMENT: venvPath,
          UV_PYTHON_INSTALL_DIR: path.join(this.runtimePath, ".python"),
          UV_CACHE_DIR: paths.setupCachePath,
          TMP: paths.temporaryPath,
          TEMP: paths.temporaryPath,
          TMPDIR: paths.temporaryPath,
        },
      });

      this.currentProcess = proc;

      proc.stdout?.on("data", (data) => {
        const lines = data.toString().trim().split("\n");
        for (const line of lines) {
          if (line) {
            onProgress({ status: "installing", message: line });
          }
        }
      });

      proc.stderr?.on("data", (data) => {
        const lines = data.toString().trim().split("\n");
        for (const line of lines) {
          if (line) {
            onProgress({ status: "installing", message: line });
          }
        }
      });

      proc.on("error", (err) => {
        this.currentProcess = null;
        reject(err);
      });

      proc.on("close", (code) => {
        this.currentProcess = null;
        if (this.isAborting) {
          reject(new Error("Aborted"));
        } else if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
    });
  }

  private ensureRuntimeIsWritable(): void {
    fs.mkdirSync(this.runtimePath, { recursive: true });
    const probe = path.join(
      this.runtimePath,
      `.trainkit-write-test-${process.pid}-${Date.now()}`,
    );
    try {
      fs.writeFileSync(probe, "TrainKit write test", { flag: "wx" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `TrainKit cannot write beside its packaged backend (${this.runtimePath}). ` +
          `Move or extract TrainKit to a writable folder and try again. ${message}`,
      );
    } finally {
      fs.rmSync(probe, { force: true });
    }
  }

  private cleanSetupArtifacts(
    onProgress: (progress: SetupProgress) => void,
  ): void {
    const paths = getRuntimePaths();
    onProgress({ status: "installing", message: "Removing setup download cache..." });
    for (const generatedPath of [paths.setupCachePath, paths.temporaryPath]) {
      try {
        fs.rmSync(generatedPath, { recursive: true, force: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        onProgress({
          status: "installing",
          message: `Could not completely remove ${generatedPath}: ${message}`,
        });
      }
    }
  }

  private cleanLegacyRuntime(
    onProgress: (progress: SetupProgress) => void,
  ): void {
    const legacyRuntimePath = getRuntimePaths().legacyRuntimePath;
    if (
      path.resolve(legacyRuntimePath) === path.resolve(this.runtimePath) ||
      path.basename(legacyRuntimePath) !== "backend-runtime" ||
      !fs.existsSync(legacyRuntimePath)
    ) {
      return;
    }
    try {
      fs.rmSync(legacyRuntimePath, { recursive: true, force: true });
      onProgress({
        status: "installing",
        message: `Removed the obsolete per-user runtime: ${legacyRuntimePath}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onProgress({
        status: "installing",
        message: `The obsolete per-user runtime can be removed manually: ${legacyRuntimePath} (${message})`,
      });
    }
  }

  private lockHash(): string {
    const lockPath = path.join(this.backendPath, "uv.lock");
    return createHash("sha256").update(fs.readFileSync(lockPath)).digest("hex");
  }
}

let instance: SetupManager | null = null;

export function getSetupManager(): SetupManager {
  if (!instance) {
    instance = new SetupManager();
  }
  return instance;
}
