import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, PlugZap, Trash2 } from "lucide-react";
import { CLOUD_PROVIDERS, PROVIDER_DEFAULTS, type CloudProvider, type ProviderSettings } from "@/types/providers";
import { Button, Input } from "../shared";

interface ApiPanelProps {
  settings: ProviderSettings | null;
  onChange: (settings: ProviderSettings) => void;
  error: string;
}

function ProviderCard({ provider, settings, onChange }: Omit<ApiPanelProps, "error"> & { provider: CloudProvider }) {
  const status = settings?.providers[provider];
  const [key, setKey] = useState("");
  const [model, setModel] = useState(PROVIDER_DEFAULTS[provider].model);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status) { setModel(status.model); setRemember(status.remembered && settings.encryptionAvailable); }
  }, [status?.model, status?.remembered, settings?.encryptionAvailable]);

  const perform = async (action: "save" | "remove" | "test") => {
    setBusy(true); setMessage(""); setError("");
    try {
      if (action === "test") {
        await window.electronAPI.testProviderKey(provider);
        setMessage("Key accepted. Check that your account can use the selected vision model.");
      } else {
        const next = action === "save"
          ? await window.electronAPI.setProviderSettings(provider, { key: key.trim(), model: model.trim(), remember })
          : await window.electronAPI.removeProviderKey(provider);
        onChange(next); setKey("");
        setMessage(action === "save" ? "Settings saved. This provider is available in Caption." : "Key removed.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update API settings.");
    } finally { setBusy(false); }
  };

  return (
    <section className="relative min-w-0 space-y-5 border border-border bg-card/60 p-6">
      <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/70 via-accent/50 to-transparent" />
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold tracking-wide">{PROVIDER_DEFAULTS[provider].label}</h3>
        <span className={`flex items-center gap-2 text-xs ${status?.configured ? "text-accent" : "text-muted-foreground"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status?.configured ? "bg-accent shadow-[0_0_8px_var(--color-accent)]" : "bg-muted-foreground"}`} />
          {status?.configured ? status.remembered ? "REMEMBERED" : "SESSION KEY" : "NO KEY"}
        </span>
      </div>
      <Input label="API key" type="password" value={key} onChange={setKey} placeholder={status?.configured ? "Key configured · enter a new key to replace it" : "Paste your own API key"} disabled={busy || !settings} />
      <Input label="Vision model ID" value={model} onChange={setModel} disabled={busy || !settings} />
      <p className="text-xs leading-relaxed text-muted-foreground">Use a vision model available to your API account. A ChatGPT or Claude subscription does not include API credits.</p>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={busy || !settings?.encryptionAvailable} className="mt-1 h-4 w-4 accent-primary" />
        <span>Remember on this computer<span className="mt-1 block text-xs text-muted-foreground">{settings?.encryptionAvailable ? "Encrypted with your operating system. Otherwise, keys last only for this session." : "OS encryption is unavailable. Keys can be used for this session."}</span></span>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void perform("save")} disabled={!settings || (!key.trim() && !status?.configured) || !model.trim()} loading={busy}>Save settings</Button>
        <Button variant="secondary" onClick={() => void perform("test")} disabled={busy || !status?.configured || Boolean(key.trim())}><PlugZap className="h-4 w-4" />Test key</Button>
        <Button variant="secondary" onClick={() => void perform("remove")} disabled={busy || !status?.configured}><Trash2 className="h-4 w-4" />Remove</Button>
      </div>
      <div aria-live="polite" className="text-sm">
        {message && <p className="text-accent">{message}</p>}
        {error && <p className="text-destructive">{error}</p>}
      </div>
    </section>
  );
}

export function ApiPanel({ settings, onChange, error }: ApiPanelProps) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3"><KeyRound className="h-5 w-5 text-primary" /><div><h2 className="font-semibold tracking-wider">API CONNECTIONS</h2><p className="text-xs text-muted-foreground">Your keys. Your models. One caption workflow.</p></div></div>
        <div className="flex gap-3 border border-accent/25 bg-accent/5 p-4 text-sm leading-relaxed"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" /><p>Cloud captioning sends images and your instruction to the selected provider and uses your API credits.</p></div>
        {(error || settings?.warning) && <p role="alert" className="text-sm text-destructive">{error || settings?.warning}</p>}
        <div className="grid gap-6 lg:grid-cols-2">{CLOUD_PROVIDERS.map((provider) => <ProviderCard key={provider} provider={provider} settings={settings} onChange={onChange} />)}</div>
      </div>
    </div>
  );
}
