import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { MessageSquareText, Maximize2, FileEdit, Terminal } from "lucide-react";

export type ServiceTab = "caption" | "upscale" | "rename" | "logs";

interface NavigationProps {
  activeTab: ServiceTab;
  onTabChange: (tab: ServiceTab) => void;
}

const tabs: {
  id: ServiceTab;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    id: "caption",
    label: "CAPTION",
    icon: <MessageSquareText className="h-4 w-4" />,
    description: "AI Image Captioning",
  },
  {
    id: "upscale",
    label: "UPSCALE",
    icon: <Maximize2 className="h-4 w-4" />,
    description: "Image Enhancement",
  },
  {
    id: "rename",
    label: "RENAME",
    icon: <FileEdit className="h-4 w-4" />,
    description: "Batch File Renaming",
  },
  {
    id: "logs",
    label: "LOGS",
    icon: <Terminal className="h-4 w-4" />,
    description: "System Logs",
  },
];

export const Navigation = memo(function Navigation({ activeTab, onTabChange }: NavigationProps) {
  return (
    <nav className="relative border-b border-border bg-dark/50">
      {/* Scan line effect overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,107,26,0.03) 2px, rgba(255,107,26,0.03) 4px)",
          }}
        />
      </div>

      <div className="flex items-center px-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "group relative flex items-center gap-3 px-6 py-4 transition-all duration-200",
              "border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary bg-primary/10 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/5",
            )}
          >
            {/* Hover scan line effect */}
            <div
              className={cn(
                "absolute inset-0 overflow-hidden opacity-0 transition-opacity",
                "group-hover:opacity-100",
              )}
            >
              <div
                className="absolute inset-0 -translate-x-full group-hover:animate-[sweep_0.5s_ease-out]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, rgba(0,200,200,0.1), transparent)",
                }}
              />
            </div>

            {/* Icon */}
            <span
              className={cn(
                "transition-colors",
                activeTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-accent",
              )}
            >
              {tab.icon}
            </span>

            {/* Label */}
            <div className="flex flex-col items-start">
              <span className="text-sm font-semibold tracking-wider">
                {tab.label}
              </span>
              <span
                className={cn(
                  "text-[10px] tracking-wide transition-colors hidden sm:block",
                  activeTab === tab.id
                    ? "text-primary/70"
                    : "text-muted-foreground/60",
                )}
              >
                {tab.description}
              </span>
            </div>

          </button>
        ))}

        {/*label */}
        <div className="ml-auto hidden md:flex items-center gap-2 px-4 py-2">
          <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
          <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
            Select Operation
          </span>
        </div>
      </div>
    </nav>
  );
});
