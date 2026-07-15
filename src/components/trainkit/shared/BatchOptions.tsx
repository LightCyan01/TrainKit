import { Input } from "./Input";
import type { CollisionPolicy } from "@/types/contracts";

interface BatchOptionsProps {
  collisionPolicy: CollisionPolicy;
  onCollisionPolicyChange: (value: CollisionPolicy) => void;
  dryRun: boolean;
  onDryRunChange: (value: boolean) => void;
  saveManifest: boolean;
  onSaveManifestChange: (value: boolean) => void;
  resumeManifestPath: string;
  onResumeManifestPathChange: (value: string) => void;
  disabled?: boolean;
}

export function BatchOptions({
  collisionPolicy,
  onCollisionPolicyChange,
  dryRun,
  onDryRunChange,
  saveManifest,
  onSaveManifestChange,
  resumeManifestPath,
  onResumeManifestPathChange,
  disabled = false,
}: BatchOptionsProps) {
  const browseManifest = async () => {
    const selected = await window.electronAPI.openFile({
      filters: [{ name: "TrainKit manifest", extensions: ["json"] }],
    });
    if (selected) onResumeManifestPathChange(selected);
  };
  return (
    <div className="space-y-3 border border-border/70 bg-dark/30 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
            Collision policy
          </span>
          <select
            value={collisionPolicy}
            disabled={disabled}
            onChange={(event) =>
              onCollisionPolicyChange(event.target.value as CollisionPolicy)
            }
            className="w-full border border-border bg-input px-4 py-3 text-sm focus:border-primary/50 focus:outline-none"
          >
            <option value="fail">Fail safely</option>
            <option value="skip">Skip existing</option>
            <option value="rename">Create unique names</option>
            <option value="overwrite">Overwrite atomically</option>
          </select>
        </label>
        <div className="flex flex-col justify-end gap-3 pb-3 text-sm text-foreground">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={dryRun}
              disabled={disabled}
              onChange={(event) => onDryRunChange(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Dry run: write manifest only
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={saveManifest || dryRun || Boolean(resumeManifestPath)}
              disabled={disabled || dryRun || Boolean(resumeManifestPath)}
              onChange={(event) => onSaveManifestChange(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Save resumable manifest
          </label>
        </div>
      </div>
      <Input
        label="Resume manifest (optional)"
        value={resumeManifestPath}
        onChange={onResumeManifestPathChange}
        placeholder="Select a previous .trainkit manifest"
        type="path"
        onBrowse={browseManifest}
        disabled={disabled}
      />
      <p className="text-[10px] text-muted-foreground">
        {dryRun
          ? "Dry runs always save their plan as a manifest."
          : resumeManifestPath
            ? "The selected resume manifest will be updated during this run."
            : saveManifest
              ? "Progress will be saved so this run can be resumed later."
              : "No manifest file will be written for this run."}
      </p>
    </div>
  );
}
