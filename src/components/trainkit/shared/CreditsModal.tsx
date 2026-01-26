import { createPortal } from "react-dom";
import { X, ExternalLink } from "lucide-react";
import { useEffect } from "react";

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreditsModal({ isOpen, onClose }: CreditsModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-card border border-border w-full max-w-md mx-4 panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-primary">
            Credits
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 hover:bg-white/10 transition-colors rounded"
            title="Close"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Developer Info */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src="https://avatars.githubusercontent.com/u/29302715?v=4"
                alt="Developer Avatar"
                className="h-16 w-16 rounded-full border-2 border-primary"
              />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground">
                LightCyan01
              </h3>
              <p className="text-sm text-muted-foreground">Developer</p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() =>
                    window.electronAPI.openExternal(
                      "https://github.com/LightCyan01",
                    )
                  }
                  className="flex items-center gap-1.5 px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary transition-colors"
                  title="GitHub Profile"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.045 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                  <span>GitHub</span>
                </button>
                {/* <button
                  onClick={() =>
                    window.electronAPI.openExternal("no website yet :(")
                  }
                  className="flex items-center gap-1.5 px-2 py-1 text-xs bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent transition-colors"
                  title="Website"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Website</span>
                </button> */}
              </div>
            </div>
          </div>

          {/* Project Info */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wider uppercase text-primary">
              About TrainKit
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A dataset preparation toolkit for AI image training.
            </p>
          </div>

          {/* Links */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold tracking-wider uppercase text-primary">
              Links
            </h4>
            <div className="space-y-1">
              <button
                onClick={() =>
                  window.electronAPI.openExternal(
                    "https://github.com/LightCyan01/TrainKit",
                  )
                }
                className="w-full flex items-center justify-between px-3 py-2 text-sm bg-muted/30 hover:bg-muted/50 border border-border text-foreground transition-colors"
              >
                <span>Repository</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() =>
                  window.electronAPI.openExternal(
                    "https://github.com/LightCyan01/TrainKit/issues",
                  )
                }
                className="w-full flex items-center justify-between px-3 py-2 text-sm bg-muted/30 hover:bg-muted/50 border border-border text-foreground transition-colors"
              >
                <span>Report Issue</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Version */}
          <div className="text-center pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">TrainKit v1.0.0</p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
