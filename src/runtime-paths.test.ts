import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveRuntimePaths } from "./runtime-paths";

vi.mock("electron", () => ({ app: {} }));

describe("resolveRuntimePaths", () => {
  it("keeps packaged dependencies with the packaged backend and logs by the executable", () => {
    const paths = resolveRuntimePaths({
      packaged: true,
      appPath: path.join("C:", "ignored", "app.asar"),
      resourcesPath: path.join("C:", "TrainKit", "resources"),
      executablePath: path.join("C:", "TrainKit", "TrainKit.exe"),
      userDataPath: path.join("C:", "Users", "user", "AppData", "Roaming", "TrainKit"),
    });

    expect(paths.backendPath).toBe(path.join("C:", "TrainKit", "resources", "backend"));
    expect(paths.runtimePath).toBe(paths.backendPath);
    expect(paths.logsPath).toBe(path.join("C:", "TrainKit", "logs"));
    expect(paths.setupCachePath).toBe(path.join(paths.backendPath, ".cache"));
  });

  it("supports an explicit runtime override without moving logs", () => {
    const paths = resolveRuntimePaths({
      packaged: true,
      appPath: "ignored",
      resourcesPath: path.join("D:", "Portable", "resources"),
      executablePath: path.join("D:", "Portable", "TrainKit.exe"),
      userDataPath: path.join("C:", "Users", "user", "TrainKit"),
      runtimeOverride: path.join("E:", "TrainKitRuntime"),
    });

    expect(paths.runtimePath).toBe(path.resolve("E:", "TrainKitRuntime"));
    expect(paths.logsPath).toBe(path.join("D:", "Portable", "logs"));
  });
});
