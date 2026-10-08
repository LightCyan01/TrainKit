import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupManager } from "./setup-manager";

const mocks = vi.hoisted(() => ({ root: "", spawn: vi.fn(), execFile: vi.fn() }));
vi.mock("child_process", () => ({ spawn: mocks.spawn, execFile: mocks.execFile }));
vi.mock("electron", () => ({ app: { getVersion: () => "1.3.1", isPackaged: true } }));
vi.mock("./runtime-paths", () => ({ getRuntimePaths: () => ({
  runtimePath: mocks.root,
  backendPath: mocks.root,
  setupCachePath: path.join(mocks.root, ".cache"),
  temporaryPath: path.join(mocks.root, ".tmp"),
  legacyRuntimePath: path.join(mocks.root, "backend-runtime"),
}) }));

let proc: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
const marker = () => path.join(mocks.root, ".setup_complete.json");
const python = () => path.join(mocks.root, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.root = fs.mkdtempSync(path.join(os.tmpdir(), "trainkit-setup-"));
  fs.writeFileSync(path.join(mocks.root, "uv.lock"), "locked dependencies");
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
    fs.writeFileSync(path.join(mocks.root, "uv.lock"), "updated dependencies");
    expect(manager.isSetupRequired()).toBe(true);
    fs.writeFileSync(path.join(mocks.root, "uv.lock"), "locked dependencies");
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
    expect(fs.existsSync(path.join(mocks.root, ".cache"))).toBe(false);
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
});
