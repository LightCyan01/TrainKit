import { useState } from "react";
import { FileEdit, Play, Square } from "lucide-react";
import { IMAGE_EXTENSIONS } from "@/lib/config";
import { useJobOperation } from "@/lib/use-job-operation";
import type { CollisionPolicy } from "@/types/contracts";
import { BatchOptions, Button, Input, JobProgress } from "../shared";
import { ImagePreview } from "../shared/ImagePreview";

export function RenamePanel({ isBackendOnline }: { isBackendOnline: boolean }) {
  const { job, isActive, start, cancel } = useJobOperation("rename");
  const [loadPath, setLoadPath] = useState("");
  const [savePath, setSavePath] = useState("");
  const [mode, setMode] = useState<"sequential" | "stem_sequential">("sequential");
  const [zeroPad, setZeroPad] = useState(5);
  const [skipDuplicates, setSkipDuplicates] = useState(false);
  const [collisionPolicy, setCollisionPolicy] = useState<CollisionPolicy>("fail");
  const [dryRun, setDryRun] = useState(false);
  const [saveManifest, setSaveManifest] = useState(false);
  const [resumeManifestPath, setResumeManifestPath] = useState("");
  const [error, setError] = useState("");
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
  const run = async () => {
    setError("");
    try {
      await start("/rename", {
        load_path: loadPath,
        save_path: savePath,
        mode,
        zero_pad: zeroPad,
        skip_duplicates: skipDuplicates,
        collision_policy: collisionPolicy,
        dry_run: dryRun,
        save_manifest: saveManifest,
        resume_manifest_path: resumeManifestPath || null,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  const canRun = isBackendOnline && loadPath && savePath && !isActive;
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5 border border-border bg-card/60 p-5">
          <div className="flex items-center gap-3"><FileEdit className="h-5 w-5 text-primary" /><div><h2 className="font-semibold tracking-wider">DETERMINISTIC RENAME</h2><p className="text-xs text-muted-foreground">Natural ordering, collision preflight, atomic copies, and optional resumable manifests</p></div></div>
          <div className="grid gap-4 md:grid-cols-2"><Input label="Input image or folder" value={loadPath} onChange={setLoadPath} type="path" onBrowse={browseLoad} onBrowseFile={browseImage} disabled={isActive} /><Input label="Output directory" value={savePath} onChange={setSavePath} type="path" onBrowse={browseSave} disabled={isActive} /></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2"><span className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">Naming mode</span><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} disabled={isActive} className="w-full border border-border bg-input px-4 py-3 text-sm"><option value="sequential">00001.jpg</option><option value="stem_sequential">DSC_00001.jpg</option></select></label>
            <label className="space-y-2"><span className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">Number width</span><input type="number" min={1} max={12} value={zeroPad} onChange={(event) => setZeroPad(Number(event.target.value))} disabled={isActive} className="w-full border border-border bg-input px-4 py-3 text-sm" /></label>
          </div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={skipDuplicates} onChange={(event) => setSkipDuplicates(event.target.checked)} disabled={isActive} className="h-4 w-4 accent-primary" />Skip visually duplicate images</label>
          <BatchOptions collisionPolicy={collisionPolicy} onCollisionPolicyChange={setCollisionPolicy} dryRun={dryRun} onDryRunChange={setDryRun} saveManifest={saveManifest} onSaveManifestChange={setSaveManifest} resumeManifestPath={resumeManifestPath} onResumeManifestPathChange={setResumeManifestPath} disabled={isActive} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <JobProgress job={job} />
          <div className="flex gap-3"><Button size="lg" onClick={run} disabled={!canRun} loading={isActive}><Play className="h-4 w-4" />{dryRun ? "Create manifest" : "Start rename"}</Button><Button size="lg" variant="destructive" onClick={cancel} disabled={!isActive}><Square className="h-4 w-4" />Cancel</Button></div>
        </section>
        <ImagePreview directoryPath={loadPath} className="min-h-[420px]" />
      </div>
    </div>
  );
}
