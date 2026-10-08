import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readImageOutput } from "./image-output";

let directory: string;
let image: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "trainkit-output-"));
  image = path.join(directory, "image.png");
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe("saved image output", () => {
  it("reads existing UTF-8 captions beside an image and prefers the selected output folder", async () => {
    fs.writeFileSync(path.join(directory, "image.txt"), "\uFEFFAn existing caption.\n");
    expect(await readImageOutput(image, "", "caption", () => true)).toBe("An existing caption.");
    const output = path.join(directory, "output");
    fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, "image.txt"), "A new caption.");
    expect(await readImageOutput(image, output, "caption", () => true)).toBe("A new caption.");
  });

  it("uses the actual renamed destination without confusing tags and captions", async () => {
    fs.writeFileSync(path.join(directory, "image.txt"), "Old caption");
    const renamed = path.join(directory, "image_1.txt");
    fs.writeFileSync(renamed, "New caption");
    expect(await readImageOutput(image, directory, "caption", () => true, renamed)).toBe("New caption");
    expect(await readImageOutput(image, directory, "tag", () => true)).toBeNull();
  });

  it("reads text tags and JSON-only scored tags without displaying JSON syntax", async () => {
    const json = path.join(directory, "image.tags.json");
    fs.writeFileSync(json, JSON.stringify({ source: image, tags: [{ tag: "blue sky", score: 0.9 }, { tag: "trees", score: 0.7 }] }));
    expect(await readImageOutput(image, "", "tag", () => true)).toBe("blue sky, trees");
    fs.writeFileSync(path.join(directory, "image.tags.txt"), "updated tags");
    expect(await readImageOutput(image, "", "tag", () => true)).toBe("updated tags");
  });

  it("distinguishes missing output from a valid empty tag result", async () => {
    expect(await readImageOutput(image, "", "tag", () => true)).toBeNull();
    fs.writeFileSync(path.join(directory, "image.tags.json"), '{"tags":[]}');
    expect(await readImageOutput(image, "", "tag", () => true)).toBe("");
  });

  it("reports malformed or oversized output and skips directories named like sidecars", async () => {
    const json = path.join(directory, "image.tags.json");
    fs.writeFileSync(json, '{"tags":[{"score":0.9}]}');
    await expect(readImageOutput(image, "", "tag", () => true)).rejects.toThrow("Saved tags could not be read");
    fs.writeFileSync(json, "null");
    await expect(readImageOutput(image, "", "tag", () => true)).rejects.toThrow("Saved tags could not be read");
    const caption = path.join(directory, "image.txt");
    fs.writeFileSync(caption, "x".repeat(256 * 1024 + 1));
    await expect(readImageOutput(image, "", "caption", () => true)).rejects.toThrow("too large");
    fs.unlinkSync(caption);
    fs.mkdirSync(caption);
    expect(await readImageOutput(image, "", "caption", () => true)).toBeNull();
  });

  it("never reads an unapproved candidate", async () => {
    fs.writeFileSync(path.join(directory, "image.txt"), "Private text");
    expect(await readImageOutput(image, directory, "caption", () => false)).toBeNull();
    expect(await readImageOutput(image, directory, "caption", () => true)).toBe("Private text");
  });
});
