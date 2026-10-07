import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input } from "./Input";
import { Textarea } from "./Textarea";

describe("shared form fields", () => {
  it("uses a native password field and unique, connected labels", () => {
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(Input, { label: "API key", value: "", type: "password", onChange: () => {} }),
      createElement(Input, { label: "Model folder", value: "", type: "path", onChange: () => {} }),
      createElement(Textarea, { label: "Instruction", value: "", onChange: () => {} }),
    ));
    expect(markup).toContain('type="password"');
    expect(markup).toContain('type="text"');
    const labelIds = [...markup.matchAll(/<label[^>]*for="([^"]+)"/g)].map((match) => match[1]);
    const fieldIds = [...markup.matchAll(/<(?:input|textarea)[^>]*id="([^"]+)"/g)].map((match) => match[1]);
    expect(labelIds).toHaveLength(3);
    expect(new Set(labelIds).size).toBe(3);
    expect(fieldIds).toEqual(labelIds);
  });
});
