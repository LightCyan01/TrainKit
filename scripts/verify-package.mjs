import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { extractFile, listPackage } from "@electron/asar";

const root = resolve(process.argv[2] ?? "out/TrainKit-win32-x64");
const required = [
  "TrainKit.exe",
  "resources/app.asar",
  "resources/backend/main.py",
  "resources/backend/pyproject.toml",
  "resources/backend/uv.lock",
];
const missing = required.filter((entry) => !existsSync(resolve(root, entry)));
if (missing.length) {
  throw new Error(`Packaged application is missing: ${missing.join(", ")}`);
}

const backendRoot = resolve(root, "resources/backend");
const archive = resolve(root, "resources/app.asar");
const bundlePrefix = "/.vite/build/backend/";
const backendEntries = readdirSync(backendRoot, { recursive: true }).map(entry => String(entry).replaceAll("\\", "/"));
const bundleEntries = listPackage(archive, { isPack: false })
  .map(entry => entry.replaceAll("\\", "/"))
  .filter(entry => entry.startsWith(bundlePrefix))
  .map(entry => entry.slice(bundlePrefix.length));
const forbidden = [...backendEntries, ...bundleEntries].filter((entry) =>
  /(^|[\\/])(tests|\.venv|\.python|\.cache|\.tmp|\.model-cache|__pycache__|\.pytest_cache|\.ruff_cache)([\\/]|$)|\.pyc$/i.test(
    entry,
  ),
);
if (forbidden.length) {
  throw new Error(
    `Packaged backend contains development/runtime artifacts: ${forbidden.slice(0, 5).join(", ")}`,
  );
}
if (backendEntries.length !== bundleEntries.length || backendEntries.some(entry => !bundleEntries.includes(entry))) {
  throw new Error("Packaged backend and its archived recovery copy do not contain the same files");
}
for (const entry of backendEntries) {
  const file = resolve(backendRoot, entry);
  if (statSync(file).isFile() && !readFileSync(file).equals(extractFile(archive, join(".vite", "build", "backend", entry)))) {
    throw new Error(`Archived backend recovery copy does not match: ${entry}`);
  }
}
console.log(`Verified packaged TrainKit layout at ${root}`);
