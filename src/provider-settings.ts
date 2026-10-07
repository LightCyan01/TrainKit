import { safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { CLOUD_PROVIDERS, isCloudProvider, PROVIDER_DEFAULTS, type CloudProvider, type ProviderSettings, type ProviderUpdate } from "./types/providers";

type Credential = { key: string; model: string; encryptedKey?: string };

function validateKey(value: unknown): string {
  if (typeof value !== "string" || !/^[\x21-\x7e]{1,4096}$/.test(value)) {
    throw new Error("Enter an API key without spaces or control characters.");
  }
  return value;
}

function validateModel(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(value)) {
    throw new Error("Enter a valid provider model ID (up to 128 characters).");
  }
  return value;
}

// Keys stay in the main process. Only explicit opt-in writes OS-encrypted bytes.
export class ProviderSettingsStore {
  private credentials: Record<CloudProvider, Credential> = {
    anthropic: { key: "", model: PROVIDER_DEFAULTS.anthropic.model },
    openai: { key: "", model: PROVIDER_DEFAULTS.openai.model },
  };
  private warning: string | null = null;

  constructor(private readonly file: string) {
    if (!fs.existsSync(file)) return;
    let saved;
    try {
      if (fs.statSync(file).size > 64 * 1024) throw new Error("Invalid settings");
      saved = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      this.warning = "Saved API settings could not be loaded. Re-enter your keys to use them.";
      return;
    }
    for (const provider of CLOUD_PROVIDERS) {
      const entry = saved?.[provider];
      if (!entry) continue;
      // Preserve another provider's encrypted bytes even if decryption is unavailable.
      if (typeof entry.encryptedKey === "string") this.credentials[provider].encryptedKey = entry.encryptedKey;
      try {
        const model = validateModel(entry.model);
        this.credentials[provider].model = model;
        if (entry.encryptedKey) {
          if (!this.encryptionAvailable() || typeof entry.encryptedKey !== "string") throw new Error("Unavailable encryption");
          const key = validateKey(safeStorage.decryptString(Buffer.from(entry.encryptedKey, "base64")));
          this.credentials[provider] = { key, model, encryptedKey: entry.encryptedKey };
        }
      } catch {
        this.warning = "Some saved API settings could not be loaded. Re-enter the affected key to use it.";
      }
    }
  }

  private encryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable() &&
      (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text");
  }

  status(): ProviderSettings {
    const state = (provider: CloudProvider) => ({
      configured: Boolean(this.credentials[provider].key),
      remembered: Boolean(this.credentials[provider].encryptedKey),
      model: this.credentials[provider].model,
    });
    return { providers: { anthropic: state("anthropic"), openai: state("openai") }, encryptionAvailable: this.encryptionAvailable(), warning: this.warning };
  }

  key(provider: CloudProvider): string {
    return this.credentials[provider].key;
  }

  private persist(next: Record<CloudProvider, Credential>) {
    const saved = Object.fromEntries(CLOUD_PROVIDERS.map((provider) => [provider, {
      model: next[provider].model,
      ...(next[provider].encryptedKey ? { encryptedKey: next[provider].encryptedKey } : {}),
    }]));
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(saved), { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } catch {
      throw new Error("Could not save API settings. Your previous settings are still active.");
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    this.credentials = next;
    this.warning = null;
  }

  set(provider: CloudProvider, update: ProviderUpdate): ProviderSettings {
    if (!isCloudProvider(provider) || !update || typeof update.remember !== "boolean") throw new Error("Invalid API settings.");
    const current = this.credentials[provider];
    const key = update.key === "" ? current.key : validateKey(update.key);
    if (!key) throw new Error("Enter an API key first.");
    const model = validateModel(update.model);
    if (update.remember && !this.encryptionAvailable()) throw new Error("OS key encryption is unavailable. Use a session key instead.");
    let encryptedKey: string | undefined;
    try {
      encryptedKey = update.remember ? safeStorage.encryptString(key).toString("base64") : undefined;
    } catch {
      throw new Error("Could not encrypt this key. Your previous settings are still active.");
    }
    this.persist({ ...this.credentials, [provider]: { key, model, encryptedKey } });
    return this.status();
  }

  remove(provider: CloudProvider): ProviderSettings {
    if (!isCloudProvider(provider)) throw new Error("Unknown API provider.");
    this.persist({ ...this.credentials, [provider]: { key: "", model: this.credentials[provider].model } });
    return this.status();
  }
}

export async function testProviderKey(provider: CloudProvider, key: string): Promise<void> {
  if (!isCloudProvider(provider)) throw new Error("Unknown API provider.");
  validateKey(key);
  let response: Response;
  try {
    response = await fetch(provider === "openai" ? "https://api.openai.com/v1/models" : "https://api.anthropic.com/v1/models", {
      headers: provider === "openai" ? { Authorization: `Bearer ${key}` } : { "x-api-key": key, "anthropic-version": "2023-06-01" },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
  } catch {
    throw new Error("Could not connect to the provider. Check your network and try again.");
  }
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "The provider rejected this key. Check the key and account permissions." : "The provider could not validate this key. Check your connection, quota, and rate limits.");
}
