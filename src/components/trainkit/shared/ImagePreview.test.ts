import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImagePreview } from "./ImagePreview";

describe("preview initial render", () => {
  it("renders safely before a file or folder has been selected", () => {
    expect(renderToStaticMarkup(createElement(ImagePreview, { directoryPath: "" }))).toContain("Select an image or folder to preview");
  });

  it("renders safely before the selected folder's async list has arrived", () => {
    expect(() => renderToStaticMarkup(createElement(ImagePreview, {
      directoryPath: "/images", outputKind: "caption", outputDirectory: "/captions",
    }))).not.toThrow();
  });
});
