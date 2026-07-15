import { app } from "electron";
import path from "node:path";

export interface RuntimePathInputs {
  packaged: boolean;
  appPath: string;
  resourcesPath: string;
  executablePath: string;
  userDataPath: string;
  runtimeOverride?: string;
}

export interface RuntimePaths {
  installPath: string;
  backendPath: string;
  runtimePath: string;
  logsPath: string;
  setupCachePath: string;
  temporaryPath: string;
  modelCachePath: string;
  legacyRuntimePath: string;
}

export function resolveRuntimePaths(input: RuntimePathInputs): RuntimePaths {
  const installPath = input.packaged
    ? path.dirname(input.executablePath)
    : input.appPath;
  const backendPath = input.packaged
    ? path.join(input.resourcesPath, "backend")
    : path.join(input.appPath, "backend");
  const override = input.runtimeOverride?.trim();
  const runtimePath = override ? path.resolve(override) : backendPath;

  return {
    installPath,
    backendPath,
    runtimePath,
    logsPath: path.join(installPath, "logs"),
    setupCachePath: path.join(runtimePath, ".cache"),
    temporaryPath: path.join(runtimePath, ".tmp"),
    modelCachePath: path.join(runtimePath, ".model-cache"),
    legacyRuntimePath: path.join(input.userDataPath, "backend-runtime"),
  };
}

export function getRuntimePaths(): RuntimePaths {
  return resolveRuntimePaths({
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    executablePath: process.execPath,
    userDataPath: app.getPath("userData"),
    runtimeOverride: process.env.TRAINKIT_RUNTIME_PATH,
  });
}
