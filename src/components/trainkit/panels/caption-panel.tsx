import { useState, useEffect } from "react";
import { Input } from "../shared/Input";
import { Textarea } from "../shared/Textarea";
import { Button } from "../shared/Button";
import { Progress } from "../shared/Progress";
import { ModelStatus, type ModelLoadState } from "../shared/ModelStatus";
import { ImagePreview } from "../shared/ImagePreview";
import { BACKEND_URL } from "@/lib/config";
import { useAppState } from "@/lib/app-state";
import { useWebSocket } from "@/lib/websocket-context";
import { cn } from "@/lib/utils";
import { Folder, FileBox, Zap } from "lucide-react";
import type { ProgressData } from "../../App";

interface CaptionPanelProps {
  isBackendOnline: boolean;
  progress: ProgressData | null;
}

export function CaptionPanel({
  isBackendOnline,
  progress: wsProgress,
}: CaptionPanelProps) {
  //panel-specific state for persistence across tab switches
  const {
    captionLoadPath: loadPath,
    setCaptionLoadPath: setLoadPath,
    captionSavePath: savePath,
    setCaptionSavePath: setSavePath,
    captionModelPath: modelPath,
    setCaptionModelPath: setModelPath,
    captionModelType: modelType,
    setCaptionModelType: setModelType,
    captionPrompt: prompt,
    setCaptionPrompt: setPrompt,
    captionStatus: status,
    setCaptionStatus: setStatus,
    captionProcessedCount: processedCount,
    setCaptionProcessedCount: setProcessedCount,
    captionImageIndex: imageIndex,
    setCaptionImageIndex: setImageIndex,
  } = useAppState();

  const { addFrontendLog } = useWebSocket();

  const [modelInfo, setModelInfo] = useState<{
    valid: boolean;
    name?: string;
    size?: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentFile, setCurrentFile] = useState("");

  // Model preload state
  const [modelLoadState, setModelLoadState] = useState<ModelLoadState>("idle");
  const [gpuMemoryUsage, setGpuMemoryUsage] = useState<number | undefined>(
    undefined,
  );

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
        addFrontendLog("success", "Captioning completed successfully");
      }
    }
  }, [wsProgress, status, addFrontendLog, setProcessedCount, setStatus]);

  // Validate model based on type
  useEffect(() => {
    if (!modelPath) {
      setModelInfo(null);
      return;
    }

    if (modelType === "folder") {
      window.electronAPI.isValidModelFolder(modelPath).then(setModelInfo);
    } else {
      window.electronAPI.isValidModel(modelPath).then(setModelInfo);
    }
  }, [modelPath, modelType]);

  useEffect(() => {
    if (!modelPath || !isBackendOnline || modelType !== "folder") {
      setModelLoadState("idle");
      setGpuMemoryUsage(undefined);
      return;
    }

    const checkModelStatus = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/model-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_path: modelPath }),
        });
        const data = await response.json();

        if (data.is_loaded) {
          setModelLoadState("loaded");
          setGpuMemoryUsage(data.gpu_memory_allocated_gb);
        } else {
          setModelLoadState("idle");
          setGpuMemoryUsage(undefined);
        }
      } catch {
        setModelLoadState("idle");
      }
    };

    checkModelStatus();
  }, [modelPath, isBackendOnline, modelType]);

  const isModelValid = modelInfo?.valid === true;
  const canStart =
    isBackendOnline && isModelValid && loadPath && savePath && prompt;
  const canPreload =
    isBackendOnline &&
    isModelValid &&
    modelType === "folder" &&
    modelLoadState !== "loading" &&
    modelLoadState !== "loaded" &&
    status !== "processing";

  const handlePreloadModel = async () => {
    if (!canPreload) return;

    setModelLoadState("loading");
    addFrontendLog("info", `Preloading model: ${modelPath}`);

    try {
      const response = await fetch(`${BACKEND_URL}/preload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_path: modelPath }),
      });

      const result = await response.json();
      if (result.error) {
        setModelLoadState("error");
        addFrontendLog("error", `Failed to preload model: ${result.error}`);
      } else {
        setModelLoadState("loaded");
        setGpuMemoryUsage(result.gpu_memory_allocated_gb);
        addFrontendLog(
          "success",
          `Model preloaded! Using ${result.gpu_memory_allocated_gb?.toFixed(2)} GB VRAM`,
        );
      }
    } catch (error) {
      setModelLoadState("error");
      addFrontendLog("error", `Failed to preload model: ${error}`);
    }
  };

  const handleUnloadModel = async () => {
    if (modelLoadState !== "loaded" || status === "processing") return;

    addFrontendLog("info", "Unloading caption model from GPU...");

    try {
      const response = await fetch(`${BACKEND_URL}/unload`, {
        method: "POST",
      });

      const result = await response.json();
      if (result.error) {
        addFrontendLog("error", `Failed to unload model: ${result.error}`);
      } else {
        setModelLoadState("idle");
        setGpuMemoryUsage(undefined);
        addFrontendLog("success", `Model unloaded! GPU memory freed.`);
      }
    } catch (error) {
      addFrontendLog("error", `Failed to unload model: ${error}`);
    }
  };

  const handleStartCaption = async () => {
    if (!canStart) return;

    setStatus("processing");
    setErrorMessage("");
    addFrontendLog(
      "info",
      `Starting captioning with ${modelType === "folder" ? "folder" : "file"} model: ${modelPath}`,
    );

    try {
      const response = await fetch(`${BACKEND_URL}/caption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption_model_path: modelPath,
          load_path: loadPath,
          save_path: savePath,
          prompt: prompt,
        }),
      });

      const result = await response.json();
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
        addFrontendLog("error", `Captioning failed: ${result.error}`);
      } else {
        setStatus("success");
        addFrontendLog("success", "Captioning completed successfully");
      }
    } catch (error) {
      setStatus("error");
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(errorMsg);
      addFrontendLog("error", `Captioning error: ${errorMsg}`);
    }
  };

  const handleCancel = async () => {
    addFrontendLog("warning", "Cancelling captioning operation...");

    try {
      //cleanup resources
      await fetch(`${BACKEND_URL}/cancel`, { method: "POST" });
    } catch {
      // Ignore
    }

    setStatus("idle");
    setCurrentFile("");
    setErrorMessage("");
    addFrontendLog("info", "Captioning cancelled");
  };

  // Browse for model
  const handleBrowseModel = async () => {
    if (modelType === "folder") {
      const path = await window.electronAPI.openDirectory();
      if (path) setModelPath(path);
    } else {
      const path = await window.electronAPI.openFile({
        filters: [
          {
            name: "Model Files",
            extensions: ["pth", "safetensors", "bin", "pt", "ckpt"],
          },
        ],
      });
      if (path) setModelPath(path);
    }
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
    <div className="flex h-full overflow-hidden justify-center">
      <div className="flex h-full w-full max-w-6xl">
        {/* Left Panel - Configuration */}
        <div className="flex flex-col gap-6 p-6 w-1/2 max-w-xl overflow-auto border-r border-border">
          {/* Panel Header */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-linear-to-r from-primary/50 to-transparent" />
            <h2 className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Caption Configuration
            </h2>
            <div className="h-px flex-1 bg-linear-to-l from-primary/50 to-transparent" />
          </div>

          {/* Model Configuration Section */}
          <div className="panel panel-bottom p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 bg-primary rounded-full" />
              <span className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">
                Model Configuration
              </span>
            </div>

            {/* Model Type Toggle */}
            <div className="flex items-center gap-4 mb-2">
              <span className="text-xs text-muted-foreground">Model Type:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModelType("folder")}
                  disabled={status === "processing"}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                    modelType === "folder"
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    status === "processing" && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <Folder className="h-3.5 w-3.5" />
                  Folder
                </button>
                <button
                  onClick={() => setModelType("file")}
                  disabled={status === "processing"}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                    modelType === "file"
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    status === "processing" && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <FileBox className="h-3.5 w-3.5" />
                  File
                </button>
              </div>
            </div>

            <Input
              label={modelType === "folder" ? "Model Folder" : "Model File"}
              value={modelPath}
              onChange={setModelPath}
              placeholder={
                modelType === "folder"
                  ? "Select captioning model folder (e.g., LLaVA)..."
                  : "Select model file (.pth, .safetensors, .ckpt)..."
              }
              type="path"
              onBrowse={handleBrowseModel}
              disabled={status === "processing"}
            />

            {modelPath && (
              <div className="space-y-2">
                <ModelStatus
                  modelName={modelInfo?.name || modelPath.split(/[/\\]/).pop()}
                  isLoaded={isModelValid}
                  loadState={modelLoadState}
                  memoryUsageInGB={gpuMemoryUsage}
                  details={
                    isModelValid
                      ? modelType === "folder"
                        ? modelLoadState === "loaded"
                          ? undefined // Will show VRAM usage from loadState
                          : "Model folder valid | Ready to preload"
                        : modelInfo?.size
                          ? `${(modelInfo.size / (1024 * 1024)).toFixed(1)} MB | Ready`
                          : "Valid | Ready"
                      : modelType === "folder"
                        ? "Invalid model folder (missing config.json)"
                        : "Invalid model file"
                  }
                />

                {modelType === "folder" &&
                  isModelValid &&
                  (modelLoadState === "loaded" ? (
                    <button
                      onClick={handleUnloadModel}
                      disabled={status === "processing"}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold tracking-wider uppercase border transition-all",
                        "border-orange/50 bg-orange/10 text-orange hover:bg-orange/20",
                        status === "processing" &&
                          "opacity-50 cursor-not-allowed pointer-events-none",
                      )}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Unload Model
                    </button>
                  ) : (
                    <button
                      onClick={handlePreloadModel}
                      disabled={!canPreload}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold tracking-wider uppercase border transition-all",
                        modelLoadState === "loading"
                          ? "border-accent/30 bg-accent/10 text-accent cursor-wait pointer-events-none"
                          : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20",
                        !canPreload &&
                          modelLoadState !== "loading" &&
                          "opacity-50 cursor-not-allowed",
                      )}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {modelLoadState === "loading"
                        ? "Loading Model..."
                        : "Preload Model"}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Prompt Section */}
          <div className="panel panel-bottom p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 bg-primary rounded-full" />
              <span className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">
                Captioning Instructions
              </span>
            </div>

            <Textarea
              label="Prompt"
              value={prompt}
              onChange={setPrompt}
              placeholder="Enter captioning instructions..."
              rows={4}
              disabled={status === "processing"}
            />
          </div>

          {/* File Paths Section */}
          <div className="panel panel-bottom p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 bg-primary rounded-full" />
              <span className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">
                File Paths
              </span>
            </div>

            <Input
              label="Load Path"
              value={loadPath}
              onChange={setLoadPath}
              placeholder="Select source image directory..."
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

          {/* Action Section */}
          <div className="mt-auto space-y-4">
            {/* Progress */}
            <Progress
              status={status}
              progress={progress}
              total={total}
              currentFile={currentFile}
            />

            {/* Buttons */}
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
                  onClick={handleStartCaption}
                  disabled={!canStart}
                  className="flex-1"
                >
                  Start Captioning
                </Button>
              )}
            </div>

            {/* Helper text */}
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

        {/* Right Panel - Image Preview */}
        <div className="flex flex-col flex-1 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-linear-to-r from-primary/50 to-transparent" />
            <h2 className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Image Preview
            </h2>
            <div className="h-px flex-1 bg-linear-to-l from-primary/50 to-transparent" />
          </div>

          <ImagePreview
            directoryPath={loadPath}
            className="flex-1"
            currentIndex={imageIndex}
            onIndexChange={setImageIndex}
          />
        </div>
      </div>
    </div>
  );
}
