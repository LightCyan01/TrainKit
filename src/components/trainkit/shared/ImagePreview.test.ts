// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronAPI } from "@/types/electron";
import { ImagePreview } from "./ImagePreview";

const firstImage = "/images/first.png";
const secondImage = "/images/second.png";
const firstDataUrl = "data:image/png;base64,Zmlyc3Q=";
const secondDataUrl = "data:image/png;base64,c2Vjb25k";
const api = {
  listImages: vi.fn<ElectronAPI["listImages"]>(),
  readImageAsDataUrl: vi.fn<ElectronAPI["readImageAsDataUrl"]>(),
  readImageOutput: vi.fn<ElectronAPI["readImageOutput"]>(),
};
let container: HTMLDivElement;
let root: Root;
const render = (props: ComponentProps<typeof ImagePreview>) => act(async () => {
  root.render(createElement(ImagePreview, props));
});

beforeEach(() => {
  api.listImages.mockReset().mockResolvedValue([firstImage, secondImage]);
  api.readImageAsDataUrl.mockReset().mockResolvedValue(firstDataUrl);
  api.readImageOutput.mockReset().mockResolvedValue("Saved caption");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("electronAPI", api);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("mounted image preview", () => {
  it("shows a selection prompt without issuing filesystem reads", async () => {
    await render({ directoryPath: "" });
    expect(container.textContent).toContain("Select an image or folder to preview");
    expect(api.listImages).not.toHaveBeenCalled();
    expect(api.readImageAsDataUrl).not.toHaveBeenCalled();
    expect(api.readImageOutput).not.toHaveBeenCalled();
  });

  it("loads a folder, image, and saved caption through their pending states", async () => {
    const listing = Promise.withResolvers<string[]>();
    const image = Promise.withResolvers<string | null>();
    const caption = Promise.withResolvers<string | null>();
    api.listImages.mockReturnValueOnce(listing.promise);
    api.readImageAsDataUrl.mockReturnValueOnce(image.promise);
    api.readImageOutput.mockReturnValueOnce(caption.promise);
    await render({ directoryPath: "/images", outputKind: "caption", outputDirectory: "/captions" });
    expect(container.textContent).toContain("Loading images...");
    await act(async () => listing.resolve([firstImage, secondImage]));
    expect(container.textContent).toContain("Loading image...");
    expect(container.textContent).toContain("Reading saved output...");
    expect(api.readImageOutput).toHaveBeenCalledWith(firstImage, "/captions", "caption");
    await act(async () => {
      image.resolve(firstDataUrl);
      caption.resolve("Caption for the first image");
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(firstDataUrl);
    expect(container.querySelector("img")?.alt).toBe("first.png");
    expect(container.textContent).toContain("Caption for the first image");
  });

  it("ignores late image and tag reads after navigating, including with the keyboard", async () => {
    const image = Promise.withResolvers<string | null>();
    const tags = Promise.withResolvers<string | null>();
    api.readImageAsDataUrl.mockImplementation(source => source === firstImage ? image.promise : Promise.resolve(secondDataUrl));
    api.readImageOutput.mockImplementation(source => source === firstImage ? tags.promise : Promise.resolve("second, tags"));
    await render({ directoryPath: "/images", outputKind: "tag", outputDirectory: "/tags" });
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next image"]')!.click());
    await act(async () => {
      image.resolve(firstDataUrl);
      tags.resolve("first, tags");
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe(secondDataUrl);
    expect(container.textContent).toContain("second, tags");
    expect(container.textContent).not.toContain("first, tags");
    expect(api.readImageOutput).toHaveBeenLastCalledWith(secondImage, "/tags", "tag");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Previous image"]')!.click());
    expect(container.querySelector("img")?.alt).toBe("first.png");
    await act(async () => container.querySelector<HTMLElement>('[aria-label^="Image preview;"]')!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ));
    expect(container.querySelector("img")?.alt).toBe("second.png");
    expect(container.textContent).toContain("second, tags");
  });

  it("refreshes saved captions without reloading the image and ignores stale refreshes", async () => {
    const props = { directoryPath: "/images", outputKind: "caption" as const, outputDirectory: "/captions" };
    await render({ ...props, refreshKey: "initial" });
    expect(container.textContent).toContain("Saved caption");
    const older = Promise.withResolvers<string | null>();
    const newer = Promise.withResolvers<string | null>();
    api.readImageOutput.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await render({ ...props, refreshKey: "first-completion" });
    await render({ ...props, refreshKey: "second-completion" });
    await act(async () => newer.resolve("Newest caption"));
    await act(async () => older.resolve("Older caption"));
    expect(container.textContent).toContain("Newest caption");
    expect(container.textContent).not.toContain("Older caption");
    expect(api.readImageAsDataUrl).toHaveBeenCalledOnce();
    expect(api.readImageOutput).toHaveBeenCalledTimes(3);
  });

  it("ignores a previous folder listing when it arrives after the current one", async () => {
    const older = Promise.withResolvers<string[]>();
    const newer = Promise.withResolvers<string[]>();
    api.listImages.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await render({ directoryPath: "/older" });
    await render({ directoryPath: "/newer" });
    await act(async () => newer.resolve(["/newer/current.png"]));
    await act(async () => older.resolve(["/older/stale.png"]));
    expect(container.querySelector("img")?.alt).toBe("current.png");
    expect(api.readImageAsDataUrl).toHaveBeenCalledOnce();
    expect(api.readImageAsDataUrl).toHaveBeenCalledWith("/newer/current.png");
  });

  it("ignores output from a previous folder and displays read errors", async () => {
    const older = Promise.withResolvers<string | null>();
    const newer = Promise.withResolvers<string | null>();
    api.readImageOutput.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await render({ directoryPath: "/images", outputKind: "caption", outputDirectory: "/older" });
    await render({ directoryPath: "/images", outputKind: "caption", outputDirectory: "/newer" });
    await act(async () => older.resolve("Caption from the previous folder"));
    expect(container.textContent).toContain("Reading saved output...");
    expect(container.textContent).not.toContain("Caption from the previous folder");
    await act(async () => newer.reject(new Error("Saved output could not be read.")));
    expect(container.textContent).toContain("Saved output could not be read.");
  });
});
