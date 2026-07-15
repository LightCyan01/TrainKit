import {
  useState,
  useEffect,
  useCallback,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";

interface ImagePreviewProps {
  directoryPath: string;
  className?: string;
  currentIndex?: number;
  onIndexChange?: (index: number) => void;
}

export const ImagePreview = memo(function ImagePreview({
  directoryPath,
  className,
  currentIndex: externalIndex,
  onIndexChange,
}: ImagePreviewProps) {
  const [images, setImages] = useState<string[]>([]);
  const [internalIndex, setInternalIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  // Use external index otherwise use internal state
  const isControlled = externalIndex !== undefined && onIndexChange !== undefined;
  const currentIndex = isControlled ? externalIndex : internalIndex;
  const setCurrentIndex = useCallback((indexOrFn: number | ((prev: number) => number)) => {
    if (isControlled) {
      const newIndex = typeof indexOrFn === "function" ? indexOrFn(externalIndex) : indexOrFn;
      onIndexChange(newIndex);
    } else {
      setInternalIndex(indexOrFn);
    }
  }, [isControlled, externalIndex, onIndexChange]);

  // Load images list when directory changes
  useEffect(() => {
    if (!directoryPath) {
      setImages([]);
      if (!isControlled) setInternalIndex(0);
      setImageDataUrl(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const loadImages = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const imageList = await window.electronAPI.listImages(directoryPath);
        if (cancelled) return;
        setImages(imageList);
        // Only reset index if not controlled and directory changed
        if (!isControlled) setInternalIndex(0);
      } catch {
        if (cancelled) return;
        setError("Failed to load images");
        setImages([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadImages();
    return () => {
      cancelled = true;
    };
  }, [directoryPath, isControlled]);

  // Load current image as data URL
  useEffect(() => {
    const img = images[currentIndex];
    if (!img) {
      setImageDataUrl(null);
      setIsLoadingImage(false);
      return;
    }

    let cancelled = false;
    const loadImage = async () => {
      setIsLoadingImage(true);
      try {
        const dataUrl = await window.electronAPI.readImageAsDataUrl(img);
        if (!cancelled) setImageDataUrl(dataUrl);
      } catch {
        if (!cancelled) setImageDataUrl(null);
      } finally {
        if (!cancelled) setIsLoadingImage(false);
      }
    };

    void loadImage();
    return () => {
      cancelled = true;
    };
  }, [images, currentIndex]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentIndex((previous) =>
          previous > 0 ? previous - 1 : images.length - 1,
        );
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentIndex((previous) =>
          previous < images.length - 1 ? previous + 1 : 0,
        );
      }
    },
    [images.length, setCurrentIndex],
  );

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length, setCurrentIndex]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length, setCurrentIndex]);

  const currentImage = images[currentIndex];
  const fileName = currentImage ? currentImage.split(/[\\/]/).pop() : "";

  if (!directoryPath) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full bg-dark/50 border border-border rounded",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="h-12 w-12 opacity-30" />
          <span className="text-xs">Select an image or folder to preview</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full bg-dark/50 border border-border rounded",
          className,
        )}
      >
        <div className="text-xs text-muted-foreground">Loading images...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full bg-dark/50 border border-border rounded",
          className,
        )}
      >
        <div className="text-xs text-destructive">{error}</div>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full bg-dark/50 border border-border rounded",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <ImageIcon className="h-12 w-12 opacity-30" />
          <span className="text-xs">No supported images found</span>
        </div>
      </div>
    );
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      aria-label="Image preview; use left and right arrow keys to navigate"
      className={cn(
        "flex flex-col h-full bg-dark/50 border border-border rounded overflow-hidden focus:outline-none focus:border-primary/50",
        className,
      )}
    >
      {/* Image container */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {isLoadingImage ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : imageDataUrl ? (
          <img
            src={imageDataUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            Failed to load image
          </div>
        )}

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 
                rounded-full text-white transition-colors"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 
                rounded-full text-white transition-colors"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Footer with file info */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-dark/30">
        <span className="text-[10px] text-muted-foreground truncate max-w-[60%]">
          {fileName}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {currentIndex + 1} / {images.length}
        </span>
      </div>
    </div>
  );
});
