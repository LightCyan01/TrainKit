import fs from "node:fs";
import path from "node:path";

// Resolve existing ancestors too: a new output folder may sit below a junction.
export function canonicalPath(value: string): string {
  let ancestor = path.resolve(value);
  const missing: string[] = [];
  // lstat sees dangling links, which realpath must reject rather than append as missing folders.
  while (!fs.lstatSync(ancestor, { throwIfNoEntry: false })) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error("Could not resolve the selected path.");
    missing.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  return path.join(fs.realpathSync.native(ancestor), ...missing);
}
