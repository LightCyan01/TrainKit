import { useState, useEffect } from "react";
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from "react-compare-slider";
import { cn } from "@/lib/utils";
import { Image as ImageIcon, Loader2 } from "lucide-react";

interface ImageCompareSliderProps {
  beforePath: string | null;
  afterPath: string | null;
  className?: string;
}

export function ImageCompareSlider({
  beforePath,
  afterPath,
  className,
}: ImageCompareSliderProps) {
  const [beforeExists, setBeforeExists] = useState(false);
  const [afterExists, setAfterExists] = useState(false);
  const [beforeDataUrl, setBeforeDataUrl] = useState<string | null>(null);
  const [afterDataUrl, setAfterDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if files exist and load as data URLs
  useEffect(() => {
    if (beforePath) {
      setIsLoading(true);
      window.electronAPI.pathExists(beforePath).then(async (exists) => {
        setBeforeExists(exists);
        if (exists) {
          const dataUrl =
            await window.electronAPI.readImageAsDataUrl(beforePath);
          setBeforeDataUrl(dataUrl);
        } else {
          setBeforeDataUrl(null);
        }
        setIsLoading(false);
      });
    } else {
      setBeforeExists(false);
      setBeforeDataUrl(null);
    }
  }, [beforePath]);

  useEffect(() => {
    if (afterPath) {
      window.electronAPI.pathExists(afterPath).then(async (exists) => {
        setAfterExists(exists);
        if (exists) {
          const dataUrl =
            await window.electronAPI.readImageAsDataUrl(afterPath);
          setAfterDataUrl(dataUrl);
        } else {
          setAfterDataUrl(null);
        }
      });
    } else {
      setAfterExists(false);
      setAfterDataUrl(null);
    }
  }, [afterPath]);

  const hasValidImages =
    beforePath &&
    afterPath &&
    beforeExists &&
    afterExists &&
    beforeDataUrl &&
    afterDataUrl;

  if (!hasValidImages) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full bg-dark/50 border border-border rounded",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          {isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <>
              <ImageIcon className="h-12 w-12 opacity-30" />
              <span className="text-xs text-center px-4">
                {!beforePath || !afterPath
                  ? "Process an image to compare before/after"
                  : "Waiting for processed images..."}
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "h-full bg-dark/50 border border-border rounded overflow-hidden",
        className,
      )}
    >
      <ReactCompareSlider
        itemOne={
          <ReactCompareSliderImage
            src={beforeDataUrl}
            alt="Before"
            style={{ objectFit: "contain" }}
          />
        }
        itemTwo={
          <ReactCompareSliderImage
            src={afterDataUrl}
            alt="After"
            style={{ objectFit: "contain" }}
          />
        }
        position={50}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
