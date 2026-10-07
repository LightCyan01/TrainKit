import { Input } from "./Input";
import type { CollisionPolicy } from "@/types/contracts";

interface BatchOptionsProps {
  collisionPolicy: CollisionPolicy;
  onCollisionPolicyChange: (value: CollisionPolicy) => void;
  saveManifest: boolean;
  onSaveManifestChange: (value: boolean) => void;
  resumeManifestPath: string;
  onResumeManifestPathChange: (value: string) => void;
  disabled?: boolean;
}

export function BatchOptions({
  collisionPolicy,
  onCollisionPolicyChange,
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
      <div className="grid items-end gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
            Collision policy
          </span>
          <select
            value={collisionPolicy}
            disabled={disabled}
            onChange={(event) =>
              onCollisionPolicyChange(event.target.value as CollisionPolicy)
            }
            className="h-12 w-full border border-border bg-input px-4 py-3 text-sm focus:border-primary/50 focus:outline-none"
          >
            <option value="fail">Fail safely</option>
            <option value="skip">Skip existing</option>
            <option value="rename">Create unique names</option>
            <option value="overwrite">Overwrite atomically</option>
          </select>
        </label>
        <label className="flex min-h-12 items-center gap-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={saveManifest || Boolean(resumeManifestPath)}
            disabled={disabled || Boolean(resumeManifestPath)}
            onChange={(event) => onSaveManifestChange(event.target.checked)}
            className="h-4 w-4 shrink-0 accent-primary"
          />
          Save resumable manifest
        </label>
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
        {resumeManifestPath
          ? "The selected resume manifest will be updated during this run."
          : saveManifest
            ? "Progress will be saved so this run can be resumed later."
            : "No manifest file will be written for this run."}
      </p>
    </div>
  );
}
