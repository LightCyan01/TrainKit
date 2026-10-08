import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupManager } from "./setup-manager";

const mocks = vi.hoisted(() => ({ root: "", backendPath: "", runtimePath: "", appPath: "", packaged: true, spawn: vi.fn(), execFile: vi.fn() }));
vi.mock("child_process", () => ({ spawn: mocks.spawn, execFile: mocks.execFile }));
vi.mock("electron", () => ({ app: { getVersion: () => "1.3.1", getAppPath: () => mocks.appPath, get isPackaged() { return mocks.packaged; } } }));
vi.mock("./runtime-paths", () => ({ getRuntimePaths: () => ({
  runtimePath: mocks.runtimePath,
  backendPath: mocks.backendPath,
  setupCachePath: path.join(mocks.runtimePath, ".cache"),
  temporaryPath: path.join(mocks.runtimePath, ".tmp"),
  legacyRuntimePath: path.join(mocks.root, "backend-runtime"),
}) }));

let proc: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
const marker = () => path.join(mocks.runtimePath, ".setup_complete.json");
const python = () => path.join(mocks.runtimePath, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const bundle = () => path.join(mocks.appPath, ".vite", "build", "backend");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.packaged = true;
  mocks.root = fs.mkdtempSync(path.join(os.tmpdir(), "trainkit-setup-"));
  mocks.backendPath = path.join(mocks.root, "backend");
  mocks.runtimePath = mocks.backendPath;
  mocks.appPath = path.join(mocks.root, "app.asar");
  fs.mkdirSync(path.join(bundle(), "core"), { recursive: true });
  fs.writeFileSync(path.join(bundle(), "main.py"), "from core.jobs import jobs");
  fs.writeFileSync(path.join(bundle(), "core", "jobs.py"), "jobs = []");
  fs.writeFileSync(path.join(bundle(), "pyproject.toml"), "[project]\nname = 'backend'");
  fs.writeFileSync(path.join(bundle(), "uv.lock"), "locked dependencies");
  fs.cpSync(bundle(), mocks.backendPath, { recursive: true });
  fs.mkdirSync(path.dirname(python()), { recursive: true });
  fs.writeFileSync(python(), "test interpreter");
  proc = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
  mocks.spawn.mockReturnValue(proc);
  mocks.execFile.mockImplementation((_command, _args, callback) => callback(null));
});
afterEach(() => fs.rmSync(mocks.root, { recursive: true, force: true }));

describe("dependency setup", () => {
  it("reuses a healthy environment across app versions but notices dependency changes or a missing interpreter", () => {
    const lockHash = createHash("sha256").update("locked dependencies").digest("hex");
    fs.writeFileSync(marker(), JSON.stringify({ version: "1.3.0", lockHash }));
    const manager = new SetupManager();
    expect(manager.isSetupRequired()).toBe(false);
    fs.writeFileSync(path.join(mocks.backendPath, "uv.lock"), "updated dependencies");
    expect(manager.isSetupRequired()).toBe(true);
    fs.writeFileSync(path.join(mocks.backendPath, "uv.lock"), "locked dependencies");
    fs.unlinkSync(python());
    expect(manager.isSetupRequired()).toBe(true);
  });

  it("treats a broken completion marker as incomplete setup", () => {
    fs.writeFileSync(marker(), "{broken");
    expect(new SetupManager().isSetupRequired()).toBe(true);
  });

  it("keeps setup pending after individual packages download and completes only after a successful installer exit", async () => {
    const progress = vi.fn();
    const setup = new SetupManager().runSetup(progress);
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledOnce());
    proc.stderr.emit("data", Buffer.from("Downloaded numpy\nDownloaded torch\n"));
    expect(progress.mock.calls.some(([event]) => event.status === "complete")).toBe(false);
    expect(fs.existsSync(marker())).toBe(false);
    proc.emit("close", 0);
    expect(await setup).toBe(true);
    expect(progress).toHaveBeenLastCalledWith({ status: "complete", message: "Setup complete!" });
    expect(new SetupManager().isSetupRequired()).toBe(false);
    expect(fs.existsSync(path.join(mocks.runtimePath, ".cache"))).toBe(false);
  });

  it("does not leave a completion marker after a failed install", async () => {
    const progress = vi.fn();
    const setup = new SetupManager().runSetup(progress);
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledOnce());
    proc.emit("close", 1);
    expect(await setup).toBe(false);
    expect(fs.existsSync(marker())).toBe(false);
    expect(progress).toHaveBeenLastCalledWith({ status: "error", message: "Setup failed: Command failed with code 1" });
  });

  it("restores a deleted packaged backend before running its installer", async () => {
    fs.rmSync(mocks.backendPath, { recursive: true });
    const manager = new SetupManager();
    manager.prepareBackend();
    expect(fs.readFileSync(path.join(mocks.backendPath, "core", "jobs.py"), "utf8")).toBe("jobs = []");
    expect(manager.isSetupRequired()).toBe(true);
    const setup = manager.runSetup(vi.fn());
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledOnce());
    expect(fs.readFileSync(path.join(mocks.backendPath, "pyproject.toml"), "utf8")).toContain("[project]");
    expect(mocks.spawn.mock.calls[0][1]).toEqual(["sync", "--project", mocks.backendPath, "--locked", "--no-dev"]);
    proc.emit("close", 0);
    expect(await setup).toBe(true);
  });

  it("restores missing backend files without changing dependencies, models, or existing files", () => {
    const lockHash = createHash("sha256").update("locked dependencies").digest("hex");
    fs.writeFileSync(marker(), JSON.stringify({ lockHash }));
    fs.writeFileSync(path.join(mocks.backendPath, "main.py"), "existing backend file");
    fs.mkdirSync(path.join(mocks.runtimePath, ".model-cache"));
    const model = path.join(mocks.runtimePath, ".model-cache", "model.bin");
    fs.writeFileSync(model, "existing model");
    fs.unlinkSync(path.join(mocks.backendPath, "pyproject.toml"));
    fs.unlinkSync(path.join(mocks.backendPath, "uv.lock"));
    fs.rmSync(path.join(mocks.backendPath, "core"), { recursive: true });

    const manager = new SetupManager();
    manager.prepareBackend();
    expect(fs.readFileSync(path.join(mocks.backendPath, "core", "jobs.py"), "utf8")).toBe("jobs = []");
    expect(fs.readFileSync(path.join(mocks.backendPath, "main.py"), "utf8")).toBe("existing backend file");
    expect(fs.readFileSync(python(), "utf8")).toBe("test interpreter");
    expect(fs.readFileSync(model, "utf8")).toBe("existing model");
    expect(manager.isSetupRequired()).toBe(false);
    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("recreates a missing environment while keeping an explicit runtime location", async () => {
    mocks.runtimePath = path.join(mocks.root, "custom-runtime");
    const manager = new SetupManager();
    manager.prepareBackend();
    expect(manager.isSetupRequired()).toBe(true);
    const setup = manager.runSetup(vi.fn());
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledOnce());
    expect(mocks.spawn.mock.calls[0][2].env.UV_PROJECT_ENVIRONMENT).toBe(path.join(mocks.runtimePath, ".venv"));
    expect(fs.existsSync(path.join(mocks.runtimePath, "pyproject.toml"))).toBe(false);
    proc.emit("close", 0);
    expect(await setup).toBe(true);
  });

  it("reports a missing bundled backend before running any installer", async () => {
    fs.rmSync(bundle(), { recursive: true });
    const progress = vi.fn();
    expect(await new SetupManager().runSetup(progress)).toBe(false);
    expect(progress).toHaveBeenLastCalledWith({ status: "error", message: expect.stringContaining("Extract the release ZIP") });
    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("does not overwrite a file blocking a backend directory", async () => {
    fs.rmSync(path.join(mocks.backendPath, "core"), { recursive: true });
    fs.writeFileSync(path.join(mocks.backendPath, "core"), "keep this file");
    const progress = vi.fn();
    expect(await new SetupManager().runSetup(progress)).toBe(false);
    expect(fs.readFileSync(path.join(mocks.backendPath, "core"), "utf8")).toBe("keep this file");
    expect(progress).toHaveBeenLastCalledWith({ status: "error", message: expect.stringContaining("writable folder") });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("reports missing development source without recreating an empty backend", async () => {
    mocks.packaged = false;
    fs.rmSync(mocks.backendPath, { recursive: true });
    const progress = vi.fn();
    expect(await new SetupManager().runSetup(progress)).toBe(false);
    expect(progress).toHaveBeenLastCalledWith({ status: "error", message: expect.stringContaining("Restore the backend folder") });
    expect(fs.existsSync(mocks.backendPath)).toBe(false);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
