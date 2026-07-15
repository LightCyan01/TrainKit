import { useState } from "react";
import { Cpu, Maximize2, Play, Search, Square } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { IMAGE_EXTENSIONS } from "@/lib/config";
import { useJobOperation } from "@/lib/use-job-operation";
import type { CollisionPolicy } from "@/types/contracts";
import { BatchOptions, Button, Input, JobProgress, ModelStatus } from "../shared";
import { ImagePreview } from "../shared/ImagePreview";

type UpscaleBackend = "spandrel" | "ncnn";

export function UpscalePanel({ isBackendOnline }: { isBackendOnline: boolean }) {
  const { job, isActive, start, cancel } = useJobOperation("upscale");
  const [backend, setBackend] = useState<UpscaleBackend>("spandrel");
  const [modelPath, setModelPath] = useState("");
  const [modelBinPath, setModelBinPath] = useState("");
  const [modelValid, setModelValid] = useState(false);
  const [modelInfo, setModelInfo] = useState<{
    scale: number;
    architecture: string;
    name: string;
    vulkan?: boolean;
    input_blob?: string;
    output_blob?: string;
  } | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [loadPath, setLoadPath] = useState("");
  const [savePath, setSavePath] = useState("");
  const [format, setFormat] = useState<"jpg" | "png" | "bmp" | "webp">("png");
  const [useTiling, setUseTiling] = useState(true);
  const [tileSize, setTileSize] = useState(512);
  const [tileOverlap, setTileOverlap] = useState(16);
  const [inputBlob, setInputBlob] = useState("");
  const [outputBlob, setOutputBlob] = useState("");
  const [ncnnScale, setNcnnScale] = useState(4);
  const [useVulkan, setUseVulkan] = useState(true);
  const [collisionPolicy, setCollisionPolicy] = useState<CollisionPolicy>("fail");
  const [dryRun, setDryRun] = useState(false);
  const [saveManifest, setSaveManifest] = useState(false);
  const [resumeManifestPath, setResumeManifestPath] = useState("");
  const [error, setError] = useState("");

  const changeModelPath = (value: string) => {
    setModelPath(value);
    setModelValid(false);
    setModelInfo(null);
    setInputBlob("");
    setOutputBlob("");
  };

  const browseModel = async () => {
    const selected = await window.electronAPI.openFile({
      filters: [
        backend === "spandrel"
          ? { name: "Safe Spandrel model", extensions: ["safetensors"] }
          : { name: "NCNN graph", extensions: ["param"] },
      ],
    });
    if (!selected) return;
    setModelPath(selected);
    setModelInfo(null);
    const validation = await window.electronAPI.isValidModel(selected);
    setModelValid(validation.valid);
  };
  const browseBin = async () => {
    const selected = await window.electronAPI.openFile({
      filters: [{ name: "NCNN weights", extensions: ["bin"] }],
    });
    if (selected) setModelBinPath(selected);
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
  const inspectModel = async () => {
    setInspecting(true);
    setError("");
    try {
      const info = await apiRequest<typeof modelInfo>("/upscale-model-info", {
        method: "POST",
        body: {
          model_path: modelPath,
          backend,
          model_bin_path: modelBinPath || null,
          input_blob: inputBlob.trim() || null,
          output_blob: outputBlob.trim() || null,
          scale: ncnnScale,
          use_vulkan: useVulkan,
        },
      });
      setModelInfo(info);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setInspecting(false);
    }
  };
  const run = async () => {
    setError("");
    try {
      await start("/upscale", {
        upscale_model_path: modelPath,
        backend,
        ncnn_model_bin_path: modelBinPath || null,
        ncnn_input_blob: inputBlob.trim() || null,
        ncnn_output_blob: outputBlob.trim() || null,
        ncnn_scale: ncnnScale,
        ncnn_use_vulkan: useVulkan,
        load_path: loadPath,
        save_path: savePath,
        format,
        use_tiling: useTiling,
        tile_size: tileSize,
        tile_overlap: tileOverlap,
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
    isBackendOnline &&
    modelValid &&
    loadPath &&
    savePath &&
    !isActive;
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5 border border-border bg-card/60 p-5">
          <div className="flex items-center gap-3"><Maximize2 className="h-5 w-5 text-primary" /><div><h2 className="font-semibold tracking-wider">IMAGE UPSCALING</h2><p className="text-xs text-muted-foreground">Safe Spandrel descriptors or NCNN CPU/Vulkan inference</p></div></div>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <label className="space-y-2"><span className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">Backend</span><select value={backend} onChange={(event) => { setBackend(event.target.value as UpscaleBackend); setModelPath(""); setModelBinPath(""); setInputBlob(""); setOutputBlob(""); setModelValid(false); setModelInfo(null); }} disabled={isActive} className="w-full border border-border bg-input px-4 py-3 text-sm"><option value="spandrel">Spandrel</option><option value="ncnn">NCNN Python</option></select></label>
            <Input label={backend === "spandrel" ? "Safetensors model" : "NCNN .param graph"} value={modelPath} onChange={changeModelPath} type="path" onBrowse={browseModel} disabled={isActive} />
          </div>
          {backend === "ncnn" && (
            <div className="space-y-4 border border-accent/20 bg-accent/5 p-4">
              <Input label="NCNN .bin weights (optional override)" value={modelBinPath} onChange={setModelBinPath} placeholder="Auto: matching .bin beside the .param file" type="path" onBrowse={browseBin} disabled={isActive} />
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-2"><span className="text-[10px] uppercase text-muted-foreground">Input blob override</span><input value={inputBlob} onChange={(event) => setInputBlob(event.target.value)} placeholder="Auto detect" className="w-full border border-border bg-input px-3 py-2 text-sm" /></label>
                <label className="space-y-2"><span className="text-[10px] uppercase text-muted-foreground">Output blob override</span><input value={outputBlob} onChange={(event) => setOutputBlob(event.target.value)} placeholder="Auto detect" className="w-full border border-border bg-input px-3 py-2 text-sm" /></label>
                <label className="space-y-2"><span className="text-[10px] uppercase text-muted-foreground">Scale</span><input type="number" min={1} max={16} value={ncnnScale} onChange={(event) => setNcnnScale(Number(event.target.value))} className="w-full border border-border bg-input px-3 py-2 text-sm" /></label>
              </div>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={useVulkan} onChange={(event) => setUseVulkan(event.target.checked)} className="h-4 w-4 accent-primary" />Use Vulkan when available</label>
            </div>
          )}
          <div className="flex gap-3"><Button variant="secondary" onClick={inspectModel} disabled={!modelValid || isActive} loading={inspecting}><Search className="h-4 w-4" />Inspect model</Button></div>
          <ModelStatus modelName={modelInfo?.name ?? modelPath.split(/[\\/]/).pop()} isLoaded={Boolean(modelInfo)} loadState={inspecting ? "loading" : modelInfo ? "loaded" : "idle"} details={modelInfo ? `${modelInfo.architecture} | ${modelInfo.scale}x${backend === "ncnn" && modelInfo.vulkan ? " | Vulkan" : ""}${backend === "ncnn" ? ` | ${modelInfo.input_blob} → ${modelInfo.output_blob}` : ""}` : backend === "ncnn" ? "Inspection auto-detects NCNN input and output blobs" : "Inspection is explicit; selecting a file never deserializes it"} />
          <div className="grid gap-4 md:grid-cols-2"><Input label="Input image or folder" value={loadPath} onChange={setLoadPath} type="path" onBrowse={browseLoad} onBrowseFile={browseImage} disabled={isActive} /><Input label="Output images" value={savePath} onChange={setSavePath} type="path" onBrowse={browseSave} disabled={isActive} /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2"><span className="text-[10px] uppercase text-muted-foreground">Output format</span><select value={format} onChange={(event) => setFormat(event.target.value as typeof format)} className="w-full border border-border bg-input px-3 py-2 text-sm"><option value="png">PNG</option><option value="jpg">JPEG</option><option value="webp">WebP</option><option value="bmp">BMP</option></select></label>
            <label className="space-y-2"><span className="text-[10px] uppercase text-muted-foreground">Tile size</span><input type="number" min={64} max={4096} value={tileSize} onChange={(event) => setTileSize(Number(event.target.value))} className="w-full border border-border bg-input px-3 py-2 text-sm" /></label>
            <label className="space-y-2"><span className="text-[10px] uppercase text-muted-foreground">Overlap</span><input type="number" min={0} max={512} value={tileOverlap} onChange={(event) => setTileOverlap(Number(event.target.value))} className="w-full border border-border bg-input px-3 py-2 text-sm" /></label>
          </div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={useTiling} onChange={(event) => setUseTiling(event.target.checked)} className="h-4 w-4 accent-primary" /><Cpu className="h-4 w-4" />Tile large images to limit memory</label>
          <BatchOptions collisionPolicy={collisionPolicy} onCollisionPolicyChange={setCollisionPolicy} dryRun={dryRun} onDryRunChange={setDryRun} saveManifest={saveManifest} onSaveManifestChange={setSaveManifest} resumeManifestPath={resumeManifestPath} onResumeManifestPathChange={setResumeManifestPath} disabled={isActive} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <JobProgress job={job} />
          <div className="flex gap-3"><Button size="lg" onClick={run} disabled={!canRun} loading={isActive}><Play className="h-4 w-4" />{dryRun ? "Create manifest" : "Start upscaling"}</Button><Button size="lg" variant="destructive" onClick={cancel} disabled={!isActive}><Square className="h-4 w-4" />Cancel</Button></div>
        </section>
        <ImagePreview directoryPath={loadPath} className="min-h-[420px]" />
      </div>
    </div>
  );
}
