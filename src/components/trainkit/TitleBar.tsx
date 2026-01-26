import React, { useState, useEffect } from "react";
import { Minus, Square, X, Copy, Sun, Moon, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./shared/Logo";
import { CreditsModal } from "./shared/CreditsModal";

interface TitleBarProps {
  isBackendOnline: boolean;
}

export function TitleBar({ isBackendOnline }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showCredits, setShowCredits] = useState(false);

  // Check initial maximized state
  useEffect(() => {
    window.electronAPI.windowIsMaximized().then(setIsMaximized);

    // Listen for window state changes (on resize)
    const handleResize = () => {
      window.electronAPI.windowIsMaximized().then(setIsMaximized);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleMinimize = () => {
    window.electronAPI.windowMinimize();
  };

  const handleMaximize = async () => {
    await window.electronAPI.windowMaximize();
    const maximized = await window.electronAPI.windowIsMaximized();
    setIsMaximized(maximized);
  };

  const handleClose = () => {
    window.electronAPI.windowClose();
  };

  const handleThemeToggle = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.documentElement.classList.toggle("light", newTheme === "light");
  };

  const handleCreditsOpen = () => {
    setShowCredits(true);
  };

  return (
    <div className="flex items-center justify-between bg-division-dark border-b border-border h-9 select-none">
      {/* Draggable region with logo */}
      <div
        className="flex items-center gap-3 px-3 h-full flex-1"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <Logo className="h-5 w-5" />

        <span className="text-xs font-semibold tracking-[0.15em] text-foreground uppercase">
          TrainKit
        </span>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 ml-2">
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isBackendOnline ? "bg-success status-online" : "bg-destructive",
            )}
          />
          <span
            className={cn(
              "text-[10px] font-medium tracking-wider uppercase",
              isBackendOnline ? "text-success" : "text-destructive",
            )}
          >
            {isBackendOnline ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {/* Theme toggle and credits */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleThemeToggle}
          className="flex items-center justify-center w-12 h-full hover:bg-white/10 transition-colors"
          title={
            theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"
          }
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Moon className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <button
          onClick={handleCreditsOpen}
          className="flex items-center justify-center w-12 h-full hover:bg-white/10 transition-colors"
          title="Credits"
        >
          <Info className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Window controls */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="flex items-center justify-center w-12 h-full hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <Minus className="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          onClick={handleMaximize}
          className="flex items-center justify-center w-12 h-full hover:bg-white/10 transition-colors"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Copy className="h-3.5 w-3.5 text-muted-foreground rotate-180" />
          ) : (
            <Square className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>

        <button
          onClick={handleClose}
          className="flex items-center justify-center w-12 h-full hover:bg-destructive transition-colors group"
          title="Close"
        >
          <X className="h-4 w-4 text-muted-foreground group-hover:text-white" />
        </button>
      </div>

      {/* Credits Modal */}
      <CreditsModal
        isOpen={showCredits}
        onClose={() => setShowCredits(false)}
      />
    </div>
  );
}
