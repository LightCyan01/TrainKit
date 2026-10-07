import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { canonicalPath } from "./path-grants";

it("resolves new output folders through existing junctions before checking grants", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trainkit-path-grant-"));
  const selected = path.join(directory, "selected");
  const outside = path.join(directory, "outside");
  const link = path.join(selected, "link");
  fs.mkdirSync(selected); fs.mkdirSync(outside);
  fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
  try {
    const candidate = canonicalPath(path.join(link, "new", "captions"));
    expect(candidate).toBe(path.join(canonicalPath(outside), "new", "captions"));
    expect(path.relative(canonicalPath(selected), candidate).startsWith("..")).toBe(true);
    expect(canonicalPath(path.join(selected, "new"))).toBe(path.join(canonicalPath(selected), "new"));
  } finally {
    fs.unlinkSync(link);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it.each([
  { location: "root", suffix: "" },
  { location: "root", suffix: "new/captions" },
  { location: "child", suffix: "" },
  { location: "child", suffix: "new/captions" },
])("rejects a dangling junction at the selected $location with suffix '$suffix'", ({ location, suffix }) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trainkit-path-grant-"));
  const selected = path.join(directory, "selected");
  const link = location === "root" ? selected : path.join(selected, "link");
  if (location === "child") fs.mkdirSync(selected);
  fs.symlinkSync(path.join(directory, "missing-outside"), link, process.platform === "win32" ? "junction" : "dir");
  try {
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(link)).toBe(false);
    expect(() => canonicalPath(path.join(link, suffix))).toThrow();
  } finally {
    fs.unlinkSync(link);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it("allows ordinary missing child directories below a selected root", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trainkit-path-grant-"));
  try {
    const candidate = canonicalPath(path.join(directory, "new", "captions"));
    expect(candidate).toBe(path.join(fs.realpathSync.native(directory), "new", "captions"));
    expect(path.relative(canonicalPath(directory), candidate)).toBe(path.join("new", "captions"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
