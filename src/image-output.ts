import fs from "node:fs/promises";
import path from "node:path";
import type { ImageOutputKind } from "./types/contracts";

const OUTPUT_PREVIEW_LIMIT = 256 * 1024;

export function sidecarPaths(imagePath: string, directory: string, kind: ImageOutputKind): string[] {
  const stem = path.parse(imagePath).name;
  return kind === "caption"
    ? [path.join(directory, `${stem}.txt`)]
    : [path.join(directory, `${stem}.tags.txt`), path.join(directory, `${stem}.tags.json`)];
}

export async function readImageOutput(
  imagePath: string,
  outputDirectory: string,
  kind: ImageOutputKind,
  canRead: (filePath: string) => boolean,
  generatedPath?: string,
): Promise<string | null> {
  const candidates = [
    ...(generatedPath ? [generatedPath] : []),
    ...(outputDirectory ? sidecarPaths(imagePath, outputDirectory, kind) : []),
    ...sidecarPaths(imagePath, path.dirname(imagePath), kind),
  ];
  for (const candidate of new Set(candidates)) {
    if (!canRead(candidate)) continue;
    try {
      const stats = await fs.stat(candidate);
      if (!stats.isFile()) continue;
      if (stats.size > OUTPUT_PREVIEW_LIMIT) throw new Error("Saved output is too large to preview.");
      const data = await fs.readFile(candidate);
      if (data.length > OUTPUT_PREVIEW_LIMIT) throw new Error("Saved output is too large to preview.");
      const text = data.toString("utf8").replace(/^\uFEFF/, "").trim();
      if (kind === "caption" || path.extname(candidate) !== ".json") return text;
      let tags: unknown;
      try {
        tags = (JSON.parse(text) as { tags?: unknown }).tags;
      } catch {
        throw new Error("Saved tags could not be read.");
      }
      if (!Array.isArray(tags) || !tags.every(tag => tag && typeof tag.tag === "string")) {
        throw new Error("Saved tags could not be read.");
      }
      return tags.map(tag => tag.tag).join(", ");
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes((error as { code?: string }).code ?? "")) continue;
      throw error;
    }
  }
  return null;
}
