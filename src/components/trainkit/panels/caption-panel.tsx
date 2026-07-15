import { useEffect, useState } from "react";
import { Brain, Play, Square, Upload, Unplug } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { IMAGE_EXTENSIONS } from "@/lib/config";
import { useJobOperation } from "@/lib/use-job-operation";
import { useWebSocket } from "@/lib/websocket-context";
import type { CollisionPolicy } from "@/types/contracts";
import { BatchOptions, Button, Input, JobProgress, ModelStatus, Textarea } from "../shared";
import { ImagePreview } from "../shared/ImagePreview";

type CaptionAdapter = "auto" | "multimodal" | "blip" | "instructblip";

export function CaptionPanel({ isBackendOnline }: { isBackendOnline: boolean }) {
  const { addFrontendLog } = useWebSocket();
  const { job, isActive, start, cancel } = useJobOperation("caption");
  const [modelPath, setModelPath] = useState("");
  const [adapter, setAdapter] = useState<CaptionAdapter>("auto");
  const [loadPath, setLoadPath] = useState("");
  const [savePath, setSavePath] = useState("");
  const [prompt, setPrompt] = useState("Write a detailed, factual training caption.");
  const [collisionPolicy, setCollisionPolicy] = useState<CollisionPolicy>("fail");
  const [dryRun, setDryRun] = useState(false);
  const [saveManifest, setSaveManifest] = useState(false);
  const [resumeManifestPath, setResumeManifestPath] = useState("");
  const [modelValid, setModelValid] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [memory, setMemory] = useState(0);
  const [loadingModel, setLoadingModel] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!modelPath) {
      setModelValid(false);
      setModelLoaded(false);
      return;
    }
    const refreshModelStatus = async () => {
      try {
        const result = await window.electronAPI.isValidModelFolder(modelPath);
        if (cancelled) return;
        setModelValid(result.valid);
        setModelLoaded(false);
        setMemory(0);
        if (!result.valid || !isBackendOnline) return;
        const status = await apiRequest<{
          is_loaded: boolean;
          gpu_memory_allocated_gb: number;
        }>("/model-status", {
          method: "POST",
          body: { model_path: modelPath, adapter },
        });
        if (!cancelled) {
          setModelLoaded(status.is_loaded);
          setMemory(status.gpu_memory_allocated_gb);
        }
      } catch {
        if (!cancelled) {
          setModelValid(false);
          setModelLoaded(false);
          setMemory(0);
        }
      }
    };
    void refreshModelStatus();
    return () => {
      cancelled = true;
    };
  }, [modelPath, adapter, isBackendOnline]);

  const browseModel = async () => {
    const selected = await window.electronAPI.openDirectory();
    if (selected) setModelPath(selected);
  };
  const browseLoad = async () => {
    const selected = await window.electronAPI.openDirectory();
    if (selected) setLoadPath(selected);
  };
  const browseImage = async () => {
    const selected = await window.electronAPI.openFile({
      filters: [{ name: "Supported images", extensions: IMAGE_EXTENSIONS }],
    });
    if (selected) setLoadPath(selected);
  };
  const browseSave = async () => {
    const selected = await window.electronAPI.openDirectory();
    if (selected) setSavePath(selected);
  };
  const preload = async () => {
    setLoadingModel(true);
    setError("");
    try {
      const result = await apiRequest<{
        adapter: string;
        gpu_memory_allocated_gb: number;
      }>("/preload", { method: "POST", body: { model_path: modelPath, adapter } });
      setModelLoaded(true);
      setMemory(result.gpu_memory_allocated_gb);
      addFrontendLog("success", `Loaded ${result.adapter} caption adapter`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoadingModel(false);
    }
  };
  const unload = async () => {
    await apiRequest("/unload", { method: "POST" });
    setModelLoaded(false);
    setMemory(0);
  };
  const run = async () => {
    setError("");
    try {
      await start("/caption", {
        caption_model_path: modelPath,
        adapter,
        load_path: loadPath,
        save_path: savePath,
        prompt,
        collision_policy: collisionPolicy,
        dry_run: dryRun,
        save_manifest: saveManifest,
        resume_manifest_path: resumeManifestPath || null,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const canRun =
    isBackendOnline && modelValid && loadPath && savePath && prompt.trim() && !isActive;
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5 border border-border bg-card/60 p-5">
          <div className="flex items-center gap-3">
            <Brain className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-semibold tracking-wider">IMAGE CAPTIONING</h2>
              <p className="text-xs text-muted-foreground">LLaVA/Qwen-style multimodal, BLIP, and InstructBLIP adapters</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_190px]">
            <Input label="Model folder" value={modelPath} onChange={setModelPath} type="path" onBrowse={browseModel} disabled={isActive} />
            <label className="space-y-2">
              <span className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">Adapter</span>
              <select value={adapter} onChange={(event) => setAdapter(event.target.value as CaptionAdapter)} disabled={isActive} className="w-full border border-border bg-input px-4 py-3 text-sm">
                <option value="auto">Auto detect</option>
                <option value="multimodal">Multimodal chat</option>
                <option value="blip">BLIP</option>
                <option value="instructblip">InstructBLIP</option>
              </select>
            </label>
          </div>
          <ModelStatus modelName={modelPath.split(/[\\/]/).pop()} isLoaded={modelValid} loadState={loadingModel ? "loading" : modelLoaded ? "loaded" : "idle"} memoryUsageInGB={memory} details={modelValid ? "Valid local Hugging Face model" : "Select a folder containing config.json"} />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={preload} disabled={!modelValid || isActive} loading={loadingModel}><Upload className="h-4 w-4" />Load model</Button>
            <Button variant="secondary" onClick={unload} disabled={!modelLoaded || isActive}><Unplug className="h-4 w-4" />Unload</Button>
          </div>
          <Textarea label="Caption instruction" value={prompt} onChange={setPrompt} rows={4} disabled={isActive} />
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Input image or folder" value={loadPath} onChange={setLoadPath} type="path" onBrowse={browseLoad} onBrowseFile={browseImage} disabled={isActive} />
            <Input label="Output captions" value={savePath} onChange={setSavePath} type="path" onBrowse={browseSave} disabled={isActive} />
          </div>
          <BatchOptions collisionPolicy={collisionPolicy} onCollisionPolicyChange={setCollisionPolicy} dryRun={dryRun} onDryRunChange={setDryRun} saveManifest={saveManifest} onSaveManifestChange={setSaveManifest} resumeManifestPath={resumeManifestPath} onResumeManifestPathChange={setResumeManifestPath} disabled={isActive} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <JobProgress job={job} />
          <div className="flex gap-3">
            <Button size="lg" onClick={run} disabled={!canRun} loading={isActive}><Play className="h-4 w-4" />{dryRun ? "Create manifest" : "Start captioning"}</Button>
            <Button size="lg" variant="destructive" onClick={cancel} disabled={!isActive}><Square className="h-4 w-4" />Cancel</Button>
          </div>
        </section>
        <ImagePreview directoryPath={loadPath} className="min-h-[420px]" />
      </div>
    </div>
  );
}
