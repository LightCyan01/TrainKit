import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "../shared/Input";
import { Button } from "../shared/Button";
import { Progress } from "../shared/Progress";
import { ModelStatus } from "../shared/ModelStatus";
import { ImagePreview } from "../shared/ImagePreview";
import { ImageCompareSlider } from "../shared/ImageCompareSlider";
import {
  BACKEND_URL,
  MODEL_FILE_EXTENSIONS,
  OUTPUT_FORMATS,
} from "@/lib/config";
import { useAppState } from "@/lib/app-state";
import { useWebSocket } from "@/lib/websocket-context";
import type { ProgressData } from "../../App";
import {
  Grid3X3,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface UpscalePanelProps {
  isBackendOnline: boolean;
  progress: ProgressData | null;
}

export function UpscalePanel({
  isBackendOnline,
  progress: wsProgress,
}: UpscalePanelProps) {
  //panel-specific state for persistence across tab switches
  const {
    upscaleLoadPath: loadPath,
    setUpscaleLoadPath: setLoadPath,
    upscaleSavePath: savePath,
    setUpscaleSavePath: setSavePath,
    upscaleModelPath: modelPath,
    setUpscaleModelPath: setModelPath,
    upscaleFormat: outputFormat,
    setUpscaleFormat: setOutputFormat,
    upscaleTiling: useTiling,
    setUpscaleTiling: setUseTiling,
    upscaleStatus: status,
    setUpscaleStatus: setStatus,
    upscaleProcessedCount: processedCount,
    setUpscaleProcessedCount: setProcessedCount,
    upscaleImageIndex: imageIndex,
    setUpscaleImageIndex: setImageIndex,
  } = useAppState();

  const { addFrontendLog } = useWebSocket();

  const [modelInfo, setModelInfo] = useState<{
    valid: boolean;
    name?: string;
    size?: number;
  } | null>(null);
  const [modelScale, setModelScale] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentFile, setCurrentFile] = useState("");

  // Track current image for comparison
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [images, setImages] = useState<string[]>([]);

  // Use WebSocket progress when processing, otherwise use stored count
  const progress =
    status === "success" ? processedCount : (wsProgress?.current ?? 0);
  const total =
    status === "success" ? processedCount : (wsProgress?.total ?? 0);

  // Preview mode
  const [previewMode, setPreviewMode] = useState<
    "before" | "after" | "compare"
  >("before");

  // Update status based on WebSocket progress
  useEffect(() => {
    if (status === "processing" && wsProgress) {
      setCurrentFile(wsProgress.message);
      if (wsProgress.current === wsProgress.total && wsProgress.total > 0) {
        setProcessedCount(wsProgress.total);
        setStatus("success");
        setPreviewMode("compare");
        addFrontendLog("success", "Upscaling completed successfully");
      }
    }
  }, [wsProgress, status, addFrontendLog, setProcessedCount, setStatus]);

  // Keyboard navigation for compare mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (images.length <= 1) return;

      if (e.key === "ArrowLeft") {
        setCurrentImageIndex((prev) =>
          prev > 0 ? prev - 1 : images.length - 1,
        );
      } else if (e.key === "ArrowRight") {
        setCurrentImageIndex((prev) =>
          prev < images.length - 1 ? prev + 1 : 0,
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [images.length]);

  // Load images when directory changes
  useEffect(() => {
    if (!loadPath) {
      setImages([]);
      setCurrentImageIndex(0);
      return;
    }
    window.electronAPI.listImages(loadPath).then((imgs) => {
      setImages(imgs);
      setCurrentImageIndex(0);
    });
  }, [loadPath]);

  // Validate model path when it changes
  useEffect(() => {
    if (!modelPath) {
      setModelInfo(null);
      setModelScale(null);
      return;
    }
    window.electronAPI.isValidModel(modelPath).then(setModelInfo);
  }, [modelPath]);

  // Fetch model scale
  useEffect(() => {
    if (!modelPath || !isBackendOnline || !modelInfo?.valid) {
      setModelScale(null);
      return;
    }

    const fetchModelInfo = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/upscale-model-info`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_path: modelPath }),
        });
        const data = await response.json();
        if (data.scale) {
          setModelScale(data.scale);
        }
      } catch {
        // a
      }
    };

    fetchModelInfo();
  }, [modelPath, isBackendOnline, modelInfo?.valid]);

  const isModelValid = modelInfo?.valid === true;
  const canStart = isBackendOnline && isModelValid && loadPath && savePath;

  // Get before/after paths for current image
  const currentBeforePath = images[currentImageIndex] || null;
  const currentAfterPath =
    currentBeforePath && savePath
      ? (() => {
          const fileName = currentBeforePath.split(/[\\/]/).pop() || "";
          const baseName = fileName.replace(/\.[^.]+$/, "");
          return `${savePath}/${baseName}.${outputFormat.toLowerCase()}`;
        })()
      : null;

  const handleStartUpscale = async () => {
    if (!canStart) return;

    setStatus("processing");
    setErrorMessage("");
    addFrontendLog("info", `Starting upscale with model: ${modelPath}`);

    try {
      const response = await fetch(`${BACKEND_URL}/upscale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upscale_model_path: modelPath,
          load_path: loadPath,
          save_path: savePath,
          format: outputFormat.toLowerCase(),
          use_tiling: useTiling,
        }),
      });

      const result = await response.json();
      if (result.error) {
        setStatus("error");
        setErrorMessage(result.error);
        addFrontendLog("error", `Upscaling failed: ${result.error}`);
      } else {
        setStatus("success");
        setPreviewMode("after");
        addFrontendLog("success", "Upscaling completed successfully");
      }
    } catch (error) {
      setStatus("error");
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(errorMsg);
      addFrontendLog("error", `Upscaling error: ${errorMsg}`);
    }
  };

  const handleCancel = async () => {
    addFrontendLog("warning", "Cancelling upscaling operation...");

    try {
      await fetch(`${BACKEND_URL}/cancel`, { method: "POST" });
    } catch {
      // Ignore
    }

    setStatus("idle");
    setCurrentFile("");
    setErrorMessage("");
    addFrontendLog("info", "Upscaling cancelled");
  };

  const handleBrowseModel = async () => {
    const path = await window.electronAPI.openFile({
      filters: [
        {
          name: "Model Files",
          extensions: [...MODEL_FILE_EXTENSIONS],
        },
      ],
    });
    if (path) setModelPath(path);
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
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl">
        {/* Left Column - Configuration */}
        <div className="flex flex-col gap-6 lg:w-1/2 lg:max-w-xl min-w-0">
          {/* Panel Header */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-linear-to-r from-primary/50 to-transparent" />
            <h2 className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Upscale Configuration
            </h2>
            <div className="h-px flex-1 bg-linear-to-l from-primary/50 to-transparent" />
          </div>

          {/* Model Configuration */}
          <div className="panel panel-bottom p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 bg-primary rounded-full" />
              <span className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">
                Model Configuration
              </span>
            </div>

            <Input
              label="Model Path"
              value={modelPath}
              onChange={setModelPath}
              placeholder="Select upscaling model file..."
              type="path"
              onBrowse={handleBrowseModel}
              disabled={status === "processing"}
            />

            {modelPath && (
              <ModelStatus
                modelName={modelInfo?.name || modelPath.split(/[/\\]/).pop()}
                isLoaded={isModelValid}
                details={
                  isModelValid
                    ? modelInfo?.size
                      ? `${(modelInfo.size / (1024 * 1024)).toFixed(1)} MB${modelScale ? ` | ${modelScale}x` : ""} | Ready`
                      : `${modelScale ? `${modelScale}x | ` : ""}Ready`
                    : "Invalid model path"
                }
              />
            )}

            {/* Supported architectures link */}
            <p className="text-[10px] text-muted-foreground">
              Supported architectures:{" "}
              <button
                type="button"
                onClick={() =>
                  window.electronAPI.openExternal(
                    "https://github.com/chaiNNer-org/spandrel?tab=readme-ov-file#model-architecture-support",
                  )
                }
                className="text-accent hover:text-accent/80 hover:underline transition-colors"
              >
                View on GitHub
              </button>
            </p>
          </div>

          {/* File Paths */}
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

          {/* Output Settings */}
          <div className="panel panel-bottom p-4 space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1 w-1 bg-primary rounded-full" />
              <span className="text-[10px] font-semibold tracking-[0.15em] text-primary uppercase">
                Output Settings
              </span>
            </div>

            {/* Format Selector */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
                Output Format
              </label>
              <div className="flex gap-2">
                {OUTPUT_FORMATS.map((format) => (
                  <button
                    key={format}
                    onClick={() => setOutputFormat(format)}
                    disabled={status === "processing"}
                    className={cn(
                      "px-4 py-2 text-xs font-semibold tracking-wider uppercase border transition-all",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      outputFormat === format
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-secondary/30 border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>

            {/* Tiling Toggle */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Use Tiling
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Process large images in tiles to reduce GPU memory
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUseTiling(!useTiling)}
                disabled={status === "processing"}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  useTiling ? "bg-primary" : "bg-secondary",
                )}
              >
                <div
                  className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-foreground transition-transform",
                    useTiling ? "left-7" : "left-1",
                  )}
                />
              </button>
            </div>
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
                  onClick={handleStartUpscale}
                  disabled={!canStart}
                  className="flex-1"
                >
                  Start Upscaling
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

        {/* Right Column - Preview */}
        <div className="flex flex-col gap-4 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-linear-to-r from-accent/50 to-transparent" />
            <h2 className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              Image Preview
            </h2>
            <div className="h-px flex-1 bg-linear-to-l from-accent/50 to-transparent" />
          </div>

          <div className="panel panel-bottom flex-1 flex flex-col min-h-[300px]">
            {/* Preview Controls */}
            <div className="flex items-center justify-between p-3 border-b border-border">
              {/* View Mode Toggle */}
              <div className="flex gap-1">
                {[
                  { id: "before", label: "Before" },
                  {
                    id: "compare",
                    label: "Compare",
                    icon: <ArrowLeftRight className="h-3 w-3" />,
                  },
                  { id: "after", label: "After" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() =>
                      setPreviewMode(mode.id as typeof previewMode)
                    }
                    className={cn(
                      "px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase transition-all",
                      "flex items-center gap-1.5",
                      previewMode === mode.id
                        ? "bg-accent/20 text-accent"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode.icon}
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* Image navigation - for compare mode */}
              {previewMode === "compare" && images.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setCurrentImageIndex((prev) =>
                        prev > 0 ? prev - 1 : images.length - 1,
                      )
                    }
                    className="p-1 rounded hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"
                    title="Previous image"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-[10px] text-muted-foreground min-w-[40px] text-center">
                    {currentImageIndex + 1} / {images.length}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentImageIndex((prev) =>
                        prev < images.length - 1 ? prev + 1 : 0,
                      )
                    }
                    className="p-1 rounded hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"
                    title="Next image"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Preview Area */}
            <div className="flex-1 relative overflow-hidden bg-dark">
              {previewMode === "before" && (
                <ImagePreview
                  directoryPath={loadPath}
                  className="h-full border-0 rounded-none"
                  currentIndex={imageIndex}
                  onIndexChange={setImageIndex}
                />
              )}
              {previewMode === "after" && (
                <ImagePreview
                  directoryPath={savePath}
                  className="h-full border-0 rounded-none"
                  currentIndex={imageIndex}
                  onIndexChange={setImageIndex}
                />
              )}
              {previewMode === "compare" && (
                <ImageCompareSlider
                  beforePath={currentBeforePath}
                  afterPath={currentAfterPath}
                  className="h-full border-0 rounded-none"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
