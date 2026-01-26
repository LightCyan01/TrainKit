import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "../shared/Input";
import { Button } from "../shared/Button";
import { Progress } from "../shared/Progress";
import { Hash, FileText, AlertTriangle, Copy } from "lucide-react";
import { BACKEND_URL } from "@/lib/config";
import { useAppState } from "@/lib/app-state";
import { useWebSocket } from "@/lib/websocket-context";
import type { ProgressData } from "../../App";

interface RenamePanelProps {
  isBackendOnline: boolean;
  progress: ProgressData | null;
}

export function RenamePanel({
  isBackendOnline,
  progress: wsProgress,
}: RenamePanelProps) {
  //panel-specific state for persistence across tab switches
  const {
    renameLoadPath: loadPath,
    setRenameLoadPath: setLoadPath,
    renameSavePath: savePath,
    setRenameSavePath: setSavePath,
    renameMode,
    setRenameMode,
    skipDuplicates,
    setSkipDuplicates,
    renameStatus: status,
    setRenameStatus: setStatus,
    renameProcessedCount: processedCount,
    setRenameProcessedCount: setProcessedCount,
  } = useAppState();

  const { addFrontendLog } = useWebSocket();

  const [errorMessage, setErrorMessage] = useState("");
  const [currentFile, setCurrentFile] = useState("");

  // Use WebSocket progress when processing, otherwise use stored count
  const progress =
    status === "success" ? processedCount : (wsProgress?.current ?? 0);
  const total =
    status === "success" ? processedCount : (wsProgress?.total ?? 0);

  // Update status based on WebSocket progress
  useEffect(() => {
    if (status === "processing" && wsProgress) {
      setCurrentFile(wsProgress.message);
      if (wsProgress.current === wsProgress.total && wsProgress.total > 0) {
        setProcessedCount(wsProgress.total);
        setStatus("success");
        addFrontendLog("success", "Renaming completed successfully");
      }
    }
  }, [wsProgress, status, addFrontendLog, setProcessedCount, setStatus]);

  const canStart = isBackendOnline && loadPath && savePath;

  const handleStartRename = async () => {
    if (!canStart) return;

    setStatus("processing");
    setErrorMessage("");
    addFrontendLog("info", `Starting rename with mode: ${renameMode}`);

    try {
      const response = await fetch(`${BACKEND_URL}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          load_path: loadPath,
          save_path: savePath,
          mode: renameMode,
          skip_duplicates: skipDuplicates,
        }),
      });

      const result = await response.json();
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
        addFrontendLog("error", `Renaming failed: ${result.error}`);
      } else {
        setStatus("success");
        addFrontendLog("success", "Renaming completed successfully");
      }
    } catch (error) {
      setStatus("error");
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(errorMsg);
      addFrontendLog("error", `Renaming error: ${errorMsg}`);
    }
  };

  const handleCancel = async () => {
    addFrontendLog("warning", "Cancelling rename operation...");

    try {
      await fetch(`${BACKEND_URL}/cancel`, { method: "POST" });
    } catch {
      // Ignore
    }

    setStatus("idle");
    setCurrentFile("");
    setErrorMessage("");
    addFrontendLog("info", "Renaming cancelled");
  };

  const handleBrowseLoad = async () => {
    const path = await window.electronAPI.openDirectory();
    if (path) setLoadPath(path);
  };

  const handleBrowseSave = async () => {
    const path = await window.electronAPI.openDirectory();
    if (path) setSavePath(path);
  };

  return (
    <div className="flex justify-center h-full overflow-auto p-6">
      <div className="flex flex-col gap-6 w-full max-w-2xl">
        {/* Panel Header */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-linear-to-r from-primary/50 to-transparent" />
          <h2 className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Rename Configuration
          </h2>
          <div className="h-px flex-1 bg-linear-to-l from-primary/50 to-transparent" />
        </div>

        {/* File Paths Section */}
        <div className="panel panel-bottom p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-1 bg-primary rounded-full" />
            <span className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">
              File Paths
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Load Path"
              value={loadPath}
              onChange={setLoadPath}
              placeholder="Select source directory..."
              type="path"
              onBrowse={handleBrowseLoad}
              disabled={status === "processing"}
            />

            <Input
              label="Save Path"
              value={savePath}
              onChange={setSavePath}
              placeholder="Select output directory..."
              type="path"
              onBrowse={handleBrowseSave}
              disabled={status === "processing"}
            />
          </div>
        </div>

        {/* Rename Mode Section */}
        <div className="panel panel-bottom p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-1 bg-primary rounded-full" />
            <span className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">
              Rename Mode
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Sequential Mode */}
            <button
              onClick={() => setRenameMode("sequential")}
              disabled={status === "processing"}
              className={cn(
                "relative p-4 border text-left transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                renameMode === "sequential"
                  ? "bg-primary/10 border-primary"
                  : "bg-secondary/20 border-border hover:border-primary/50",
              )}
            >
              {/* Corner brackets for selected */}
              {renameMode === "sequential" && (
                <>
                  <div className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-primary" />
                  <div className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-primary" />
                  <div className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-primary" />
                  <div className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-primary" />
                </>
              )}

              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "p-2 border",
                    renameMode === "sequential"
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-secondary/30 border-border text-muted-foreground",
                  )}
                >
                  <Hash className="h-4 w-4" />
                </div>
                <div>
                  <h3
                    className={cn(
                      "text-sm font-semibold tracking-wider",
                      renameMode === "sequential"
                        ? "text-primary"
                        : "text-foreground",
                    )}
                  >
                    Sequential
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Renames files as simple numbers
                  </p>
                  <div className="mt-2 font-mono text-[10px] text-muted-foreground/70">
                    {"DSC_0042.jpg → 00001.jpg"}
                  </div>
                </div>
              </div>

              {/* Radio indicator */}
              <div
                className={cn(
                  "absolute top-4 right-4 w-4 h-4 rounded-full border-2 transition-all",
                  renameMode === "sequential"
                    ? "border-primary bg-primary"
                    : "border-muted-foreground",
                )}
              >
                {renameMode === "sequential" && (
                  <div className="absolute inset-1 rounded-full bg-primary-foreground" />
                )}
              </div>
            </button>

            {/* Stem Sequential Mode */}
            <button
              onClick={() => setRenameMode("stem_sequential")}
              disabled={status === "processing"}
              className={cn(
                "relative p-4 border text-left transition-all",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                renameMode === "stem_sequential"
                  ? "bg-primary/10 border-primary"
                  : "bg-secondary/20 border-border hover:border-primary/50",
              )}
            >
              {renameMode === "stem_sequential" && (
                <>
                  <div className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-primary" />
                  <div className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-primary" />
                  <div className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-primary" />
                  <div className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-primary" />
                </>
              )}

              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "p-2 border",
                    renameMode === "stem_sequential"
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-secondary/30 border-border text-muted-foreground",
                  )}
                >
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h3
                    className={cn(
                      "text-sm font-semibold tracking-wider",
                      renameMode === "stem_sequential"
                        ? "text-primary"
                        : "text-foreground",
                    )}
                  >
                    Stem Sequential
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Preserves original filename stem
                  </p>
                  <div className="mt-2 font-mono text-[10px] text-muted-foreground/70">
                    {"DSC_0042.jpg → DSC_00001.jpg"}
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "absolute top-4 right-4 w-4 h-4 rounded-full border-2 transition-all",
                  renameMode === "stem_sequential"
                    ? "border-primary bg-primary"
                    : "border-muted-foreground",
                )}
              >
                {renameMode === "stem_sequential" && (
                  <div className="absolute inset-1 rounded-full bg-primary-foreground" />
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Options Section */}
        <div className="panel panel-bottom p-4 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-1 bg-primary rounded-full" />
            <span className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">
              Options
            </span>
          </div>

          {/* Skip Duplicates Toggle */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Skip Duplicates
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Detect and exclude duplicate images using perceptual hashing
                </p>
              </div>
            </div>
            <button
              onClick={() => setSkipDuplicates(!skipDuplicates)}
              disabled={status === "processing"}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                skipDuplicates ? "bg-primary" : "bg-secondary",
              )}
            >
              <div
                className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-foreground transition-transform",
                  skipDuplicates ? "left-7" : "left-1",
                )}
              />
            </button>
          </div>

          {skipDuplicates && (
            <div className="flex items-start gap-2 p-3 bg-chart-4/10 border border-chart-4/30">
              <AlertTriangle className="h-4 w-4 text-chart-4 shrink-0 mt-0.5" />
              <p className="text-[10px] text-chart-4">
                Duplicate detection may significantly increase processing time
                for large directories.
              </p>
            </div>
          )}
        </div>

        {/* Action Section */}
        <div className="mt-auto space-y-4">
          <Progress
            status={status}
            progress={progress}
            total={total}
            currentFile={currentFile}
          />

          <div className="flex items-center gap-4">
            {status === "processing" ? (
              <Button
                variant="destructive"
                size="lg"
                onClick={handleCancel}
                className="flex-1"
              >
                Cancel Operation
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={handleStartRename}
                disabled={!canStart}
                className="flex-1"
              >
                Start Renaming
              </Button>
            )}
          </div>

          {!isBackendOnline && (
            <p className="text-xs text-destructive text-center">
              Backend is offline. Please start the backend service to begin
              processing.
            </p>
          )}

          {errorMessage && (
            <p className="text-xs text-destructive text-center">
              {errorMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
