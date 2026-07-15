import { useEffect, useState } from "react";
import { Play, Square, Tags } from "lucide-react";
import { IMAGE_EXTENSIONS } from "@/lib/config";
import { useJobOperation } from "@/lib/use-job-operation";
import type { CollisionPolicy } from "@/types/contracts";
import { BatchOptions, Button, Input, JobProgress, ModelStatus } from "../shared";
import { ImagePreview } from "../shared/ImagePreview";

export function TagPanel({ isBackendOnline }: { isBackendOnline: boolean }) {
  const { job, isActive, start, cancel } = useJobOperation("tag");
  const [modelPath, setModelPath] = useState("");
  const [modelValid, setModelValid] = useState(false);
  const [loadPath, setLoadPath] = useState("");
  const [savePath, setSavePath] = useState("");
  const [threshold, setThreshold] = useState(0.35);
  const [topK, setTopK] = useState(20);
  const [output, setOutput] = useState<"json" | "txt" | "both">("both");
  const [collisionPolicy, setCollisionPolicy] = useState<CollisionPolicy>("fail");
  const [dryRun, setDryRun] = useState(false);
  const [saveManifest, setSaveManifest] = useState(false);
  const [resumeManifestPath, setResumeManifestPath] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    if (!modelPath) return void setModelValid(false);
    void window.electronAPI
      .isValidModelFolder(modelPath)
      .then((result) => {
        if (!cancelled) setModelValid(result.valid);
      })
      .catch(() => {
        if (!cancelled) setModelValid(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelPath]);
  const chooseDirectory = async (setter: (value: string) => void) => {
    const selected = await window.electronAPI.openDirectory();
    if (selected) setter(selected);
  };
  const chooseImage = async () => {
    const selected = await window.electronAPI.openFile({
      filters: [{ name: "Supported images", extensions: IMAGE_EXTENSIONS }],
    });
    if (selected) setLoadPath(selected);
  };
  const run = async () => {
    setError("");
    try {
      await start("/tag", {
        tag_model_path: modelPath,
        load_path: loadPath,
        save_path: savePath,
        threshold,
        top_k: topK,
        output,
        collision_policy: collisionPolicy,
        dry_run: dryRun,
        save_manifest: saveManifest,
        resume_manifest_path: resumeManifestPath || null,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  const canRun = isBackendOnline && modelValid && loadPath && savePath && !isActive;
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5 border border-border bg-card/60 p-5">
          <div className="flex items-center gap-3"><Tags className="h-5 w-5 text-primary" /><div><h2 className="font-semibold tracking-wider">IMAGE TAGGING</h2><p className="text-xs text-muted-foreground">Local Hugging Face classifiers with scored JSON and training-text sidecars</p></div></div>
          <Input label="Classification model folder" value={modelPath} onChange={setModelPath} type="path" onBrowse={() => chooseDirectory(setModelPath)} disabled={isActive} />
          <ModelStatus modelName={modelPath.split(/[\\/]/).pop()} isLoaded={modelValid} details={modelValid ? "Valid image-classification model" : "Select a folder containing config.json"} />
          <div className="grid gap-4 md:grid-cols-2"><Input label="Input image or folder" value={loadPath} onChange={setLoadPath} type="path" onBrowse={() => chooseDirectory(setLoadPath)} onBrowseFile={chooseImage} disabled={isActive} /><Input label="Output tags" value={savePath} onChange={setSavePath} type="path" onBrowse={() => chooseDirectory(setSavePath)} disabled={isActive} /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2"><span className="text-[10px] uppercase text-muted-foreground">Threshold</span><input type="number" min={0} max={1} step={0.01} value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="w-full border border-border bg-input px-3 py-2 text-sm" /></label>
            <label className="space-y-2"><span className="text-[10px] uppercase text-muted-foreground">Top K</span><input type="number" min={1} max={1000} value={topK} onChange={(event) => setTopK(Number(event.target.value))} className="w-full border border-border bg-input px-3 py-2 text-sm" /></label>
            <label className="space-y-2"><span className="text-[10px] uppercase text-muted-foreground">Sidecars</span><select value={output} onChange={(event) => setOutput(event.target.value as typeof output)} className="w-full border border-border bg-input px-3 py-2 text-sm"><option value="both">JSON + TXT</option><option value="json">JSON</option><option value="txt">TXT</option></select></label>
          </div>
          <BatchOptions collisionPolicy={collisionPolicy} onCollisionPolicyChange={setCollisionPolicy} dryRun={dryRun} onDryRunChange={setDryRun} saveManifest={saveManifest} onSaveManifestChange={setSaveManifest} resumeManifestPath={resumeManifestPath} onResumeManifestPathChange={setResumeManifestPath} disabled={isActive} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <JobProgress job={job} />
          <div className="flex gap-3"><Button size="lg" onClick={run} disabled={!canRun} loading={isActive}><Play className="h-4 w-4" />{dryRun ? "Create manifest" : "Start tagging"}</Button><Button size="lg" variant="destructive" onClick={cancel} disabled={!isActive}><Square className="h-4 w-4" />Cancel</Button></div>
        </section>
        <ImagePreview directoryPath={loadPath} className="min-h-[420px]" />
      </div>
    </div>
  );
}
