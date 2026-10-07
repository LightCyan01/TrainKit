export const CLOUD_PROVIDERS = ["anthropic", "openai"] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];
export type CaptionProvider = "local" | CloudProvider;

export const PROVIDER_DEFAULTS: Record<CloudProvider, { label: string; model: string }> = {
  anthropic: { label: "Anthropic · Claude", model: "claude-haiku-4-5-20251001" },
  openai: { label: "OpenAI", model: "gpt-4.1-mini" },
};

export interface ProviderSettings {
  providers: Record<CloudProvider, { configured: boolean; remembered: boolean; model: string }>;
  encryptionAvailable: boolean;
  warning: string | null;
}

export interface ProviderUpdate {
  key: string;
  model: string;
  remember: boolean;
}

export function isCloudProvider(value: unknown): value is CloudProvider {
  return value === "anthropic" || value === "openai";
}
