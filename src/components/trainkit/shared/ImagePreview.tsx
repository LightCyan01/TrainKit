import { useEffect, useState, memo, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageOutputKind } from "@/types/contracts";

interface ImagePreviewProps {
  directoryPath: string;
  className?: string;
  outputKind?: ImageOutputKind;
  outputDirectory?: string;
  refreshKey?: string;
}

export const ImagePreview = memo(function ImagePreview({
  directoryPath,
  className,
  outputKind,
  outputDirectory = "",
  refreshKey,
}: ImagePreviewProps) {
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<{ path: string; dataUrl: string | null } | null>(null);
  const [output, setOutput] = useState<{ key: string; text: string | null; error: string } | null>(null);
  const currentImage = images[currentIndex];
  const fileName = currentImage?.split(/[\\/]/).pop() ?? "";
  const imageDataUrl = image && image.path === currentImage ? image.dataUrl : null;
  const isLoadingImage = Boolean(currentImage && image?.path !== currentImage);
  const outputKey = JSON.stringify([currentImage, outputDirectory, outputKind]);
  const currentOutput = output?.key === outputKey ? output : null;

  useEffect(() => {
    let cancelled = false;
    setImages([]);
    setCurrentIndex(0);
    setError("");
    setIsLoading(Boolean(directoryPath));
    if (!directoryPath) return;
    void window.electronAPI.listImages(directoryPath).then((list) => {
      if (!cancelled) setImages(list);
    }).catch(() => {
      if (!cancelled) setError("Failed to load images.");
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [directoryPath]);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    if (!currentImage) return;
    void window.electronAPI.readImageAsDataUrl(currentImage).then((dataUrl) => {
      if (!cancelled) setImage({ path: currentImage, dataUrl });
    }).catch(() => {
      if (!cancelled) setImage({ path: currentImage, dataUrl: null });
    });
    return () => { cancelled = true; };
  }, [currentImage]);

  useEffect(() => {
    let cancelled = false;
    if (!currentImage || !outputKind) return;
    void window.electronAPI.readImageOutput(currentImage, outputDirectory, outputKind).then((text) => {
      if (!cancelled) setOutput({ key: outputKey, text, error: "" });
    }).catch((caught) => {
      if (!cancelled) setOutput({ key: outputKey, text: null, error: caught instanceof Error ? caught.message : "Saved output could not be read." });
    });
    return () => { cancelled = true; };
  }, [currentImage, outputDirectory, outputKind, outputKey, refreshKey]);

  const previous = () => setCurrentIndex(index => (index + images.length - 1) % images.length);
  const next = () => setCurrentIndex(index => (index + 1) % images.length);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.target instanceof HTMLElement && event.target.closest("[data-saved-output]")) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") previous();
    else next();
  };

  const notice = !directoryPath ? "Select an image or folder to preview"
    : isLoading ? "Loading images..."
    : error || (images.length === 0 ? "No supported images found" : "");
  if (notice) {
    return <div className={cn("flex min-h-[320px] min-w-0 items-center justify-center self-start rounded border border-border bg-dark/50 p-5", className)}>
      <div className="flex flex-col items-center gap-3 text-muted-foreground" role={error ? "alert" : "status"}>
        <ImageIcon className="h-10 w-10 opacity-40" aria-hidden="true" />
        <p className={cn("text-sm", error && "text-foreground")}>{notice}</p>
      </div>
    </div>;
  }

  return (
    <div tabIndex={0} onKeyDown={handleKeyDown}
      aria-label="Image preview; use left and right arrow keys to navigate"
      className={cn("min-w-0 self-start space-y-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary", className)}>
      <div className={cn("relative mx-auto w-fit max-w-full overflow-hidden rounded border border-border bg-dark/50", !imageDataUrl && "flex min-h-[280px] w-full items-center justify-center")}>
        {isLoadingImage ? <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Loading image...
        </div> : imageDataUrl ? <img key={currentImage} src={imageDataUrl} alt={fileName} decoding="async"
          onError={() => setImage({ path: currentImage, dataUrl: null })}
          className="block h-auto w-auto max-h-[min(60vh,640px,calc(100vh-360px))] max-w-full" />
          : <p className="text-sm text-muted-foreground" role="status">Failed to load image.</p>}
        {images.length > 1 && <>
          <button type="button" onClick={previous} aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded bg-black/80 p-2 text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={next} aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-black/80 p-2 text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </>}
      </div>
      <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate" title={fileName}>{fileName}</span>
        <span className="shrink-0">{currentIndex + 1} / {images.length}</span>
      </div>
      {outputKind && <section data-saved-output tabIndex={0} aria-live="polite"
        className="space-y-2 border border-border bg-card/60 p-4 focus-visible:outline-2 focus-visible:outline-primary">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{outputKind === "caption" ? "Caption" : "Tags"}</h3>
        <p tabIndex={0} className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed select-text focus-visible:outline-2 focus-visible:outline-primary">
          {!currentOutput ? "Reading saved output..." : currentOutput.error ||
            (currentOutput.text === null ? `No saved ${outputKind === "caption" ? "caption" : "tags"} for this image.` : currentOutput.text || "The saved output is empty.")}
        </p>
      </section>}
    </div>
  );
});
