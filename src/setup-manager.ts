import { spawn, exec, ChildProcess } from "child_process";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";

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
  private currentProcess: ChildProcess | null = null;
  private isAborting = false;

  constructor() {
    const isDev = !app.isPackaged;

    this.backendPath = isDev
      ? path.join(app.getAppPath(), "backend")
      : path.join(process.resourcesPath, "backend");
  }

  isSetupRequired(): boolean {
    const venvPath = path.join(this.backendPath, ".venv");
    const markerPath = path.join(this.backendPath, ".setup_complete");

    return !fs.existsSync(venvPath) || !fs.existsSync(markerPath);
  }

  getBackendPath(): string {
    return this.backendPath;
  }

  abort(): void {
    this.isAborting = true;
    if (this.currentProcess && this.currentProcess.pid) {
      if (process.platform === "win32") {
        exec(`taskkill /pid ${this.currentProcess.pid} /T /F`, () => {});
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

      const venvPath = path.join(this.backendPath, ".venv");
      const markerPath = path.join(this.backendPath, ".setup_complete");

      if (!fs.existsSync(venvPath)) {
        onProgress({
          status: "installing",
          message: "Creating Python environment...",
        });
        await this.runCommand("uv", ["venv"], this.backendPath, onProgress);
      }

      if (this.isAborting) return false;

      onProgress({
        status: "installing",
        message: "Installing dependencies (this may take a few minutes)...",
      });
      await this.runCommand("uv", ["sync"], this.backendPath, onProgress);

      if (this.isAborting) return false;

      fs.writeFileSync(markerPath, new Date().toISOString());

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
      exec("uv --version", (error) => {
        resolve(!error);
      });
    });
  }

  private async checkVcppInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      exec(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64" /v Version',
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
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        stdio: "pipe",
        shell: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          UV_LINK_MODE: "copy",
          UV_PYTHON_INSTALL_DIR: path.join(this.backendPath, ".python"),
          UV_CACHE_DIR: path.join(this.backendPath, ".cache"),
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
}

let instance: SetupManager | null = null;

export function getSetupManager(): SetupManager {
  if (!instance) {
    instance = new SetupManager();
  }
  return instance;
}
