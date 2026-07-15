import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

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
const backendEntries = readdirSync(backendRoot, { recursive: true }).map(String);
const forbidden = backendEntries.filter((entry) =>
  /(^|[\\/])(tests|\.venv|\.python|\.cache|\.tmp|\.model-cache|__pycache__|\.pytest_cache|\.ruff_cache)([\\/]|$)|\.pyc$/i.test(
    entry,
  ),
);
if (forbidden.length) {
  throw new Error(
    `Packaged backend contains development/runtime artifacts: ${forbidden.slice(0, 5).join(", ")}`,
  );
}
console.log(`Verified packaged TrainKit layout at ${root}`);
