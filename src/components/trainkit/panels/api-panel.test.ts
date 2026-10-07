import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PROVIDER_DEFAULTS, type ProviderSettings } from "@/types/providers";
import { ApiPanel } from "./api-panel";

it.each([
  { configured: false, remembered: true, disabled: false },
  { configured: true, remembered: false, disabled: false },
  { configured: false, remembered: false, disabled: true },
])("allows removing a key with configured=$configured and remembered=$remembered", ({ configured, remembered, disabled }) => {
  const settings: ProviderSettings = {
    providers: {
      anthropic: { configured, remembered, model: PROVIDER_DEFAULTS.anthropic.model },
      openai: { configured: false, remembered: false, model: PROVIDER_DEFAULTS.openai.model },
    },
    encryptionAvailable: false,
    warning: remembered ? "Saved key could not be loaded." : null,
  };
  const markup = renderToStaticMarkup(createElement(ApiPanel, { settings, onChange: () => {}, error: "" }));
  const buttons = [...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
    .map(([button]) => button).filter((button) => button.includes(">Remove</span>"));
  expect(buttons).toHaveLength(2);
  expect(buttons[0].includes('disabled=""')).toBe(disabled);
  expect(buttons[1]).toContain('disabled=""');
});
