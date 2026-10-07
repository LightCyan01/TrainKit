import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const encryption = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  getSelectedStorageBackend: vi.fn(() => "gnome_libsecret"),
  encryptString: vi.fn((value: string) => Buffer.from([...value].reverse().join(""))),
  decryptString: vi.fn((value: Buffer) => [...value.toString()].reverse().join("")),
}));
vi.mock("electron", () => ({ safeStorage: encryption }));
import { ProviderSettingsStore, testProviderKey } from "./provider-settings";

describe("provider credentials", () => {
  let directory: string;
  let file: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "trainkit-credentials-"));
    file = path.join(directory, "providers.json");
    encryption.isEncryptionAvailable.mockReturnValue(true);
    vi.clearAllMocks();
  });
  afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); vi.unstubAllGlobals(); });

  it("keeps session keys out of disk and renderer status", () => {
    const store = new ProviderSettingsStore(file);
    const status = store.set("openai", { key: "test-session-key", model: "gpt-4.1-mini", remember: false });
    expect(store.key("openai")).toBe("test-session-key");
    expect(status.providers.openai).toMatchObject({ configured: true, remembered: false });
    expect(JSON.stringify(status)).not.toContain("test-session-key");
    expect(fs.readFileSync(file, "utf8")).not.toContain("test-session-key");
    expect(new ProviderSettingsStore(file).key("openai")).toBe("");
    expect(encryption.encryptString).not.toHaveBeenCalled();
  });

  it("encrypts opt-in keys, restores them, and removes persisted credentials", () => {
    const store = new ProviderSettingsStore(file);
    store.set("anthropic", { key: "test-remembered-key", model: "claude-haiku-4-5-20251001", remember: true });
    expect(encryption.encryptString).toHaveBeenCalledWith("test-remembered-key");
    expect(fs.readFileSync(file, "utf8")).not.toContain("test-remembered-key");
    const restored = new ProviderSettingsStore(file);
    expect(restored.key("anthropic")).toBe("test-remembered-key");
    restored.remove("anthropic");
    expect(restored.status().providers.anthropic.configured).toBe(false);
    expect(new ProviderSettingsStore(file).key("anthropic")).toBe("");
    expect(fs.readFileSync(file, "utf8")).not.toContain("encryptedKey");
  });

  it("refuses unavailable encryption and invalid input without replacing the previous key", () => {
    const store = new ProviderSettingsStore(file);
    store.set("openai", { key: "valid-test-key", model: "gpt-4.1-mini", remember: false });
    encryption.isEncryptionAvailable.mockReturnValue(false);
    expect(() => store.set("openai", { key: "replacement", model: "gpt-4.1-mini", remember: true })).toThrow("encryption is unavailable");
    expect(() => store.set("openai", { key: "bad\nkey", model: "gpt-4.1-mini", remember: false })).toThrow("control characters");
    expect(store.key("openai")).toBe("valid-test-key");
    fs.writeFileSync(file, "{broken");
    expect(new ProviderSettingsStore(file).status().warning).toBeTruthy();
  });

  it("tests credentials against the fixed provider endpoint and sanitizes network errors", async () => {
    const cancel = vi.fn();
    const request = vi.fn().mockResolvedValue({ ok: true, body: { cancel } });
    vi.stubGlobal("fetch", request);
    await testProviderKey("openai", "fake-test-key");
    expect(request).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.objectContaining({ redirect: "error", headers: { Authorization: "Bearer fake-test-key" } }));
    expect(cancel).toHaveBeenCalledOnce();
    request.mockRejectedValue(new Error("network trace containing fake-test-key"));
    await expect(testProviderKey("openai", "fake-test-key")).rejects.toThrow("Could not connect to the provider");
    request.mockResolvedValue({ ok: false, status: 401, body: { cancel } });
    await expect(testProviderKey("anthropic", "fake-test-key")).rejects.toThrow("provider rejected this key");
  });

  it("isolates corrupt provider records and preserves another remembered key", () => {
    const original = new ProviderSettingsStore(file);
    original.set("openai", { key: "second-provider-key", model: "gpt-4.1-mini", remember: true });
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    saved.anthropic = { model: "invalid model", encryptedKey: "broken" };
    fs.writeFileSync(file, JSON.stringify(saved));
    const restored = new ProviderSettingsStore(file);
    expect(restored.status().warning).toBeTruthy();
    expect(restored.key("openai")).toBe("second-provider-key");
    restored.set("anthropic", { key: "first-provider-key", model: "claude-haiku-4-5-20251001", remember: false });
    expect(new ProviderSettingsStore(file).key("openai")).toBe("second-provider-key");

    encryption.isEncryptionAvailable.mockReturnValue(false);
    const unavailable = new ProviderSettingsStore(file);
    unavailable.set("anthropic", { key: "session-key", model: "claude-haiku-4-5-20251001", remember: false });
    encryption.isEncryptionAvailable.mockReturnValue(true);
    expect(new ProviderSettingsStore(file).key("openai")).toBe("second-provider-key");
  });
});
