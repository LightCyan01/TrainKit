import { useState, lazy, Suspense } from "react";
import { TitleBar } from "./trainkit/TitleBar";
import { Header } from "./trainkit/Header";
import { Navigation, type ServiceTab } from "./trainkit/Navigation";
import { PanelSkeleton } from "./trainkit/shared/PanelSkeleton";

// Lazy load panel components for code-splitting
const CaptionPanel = lazy(() =>
  import("./trainkit/panels/caption-panel").then((m) => ({
    default: m.CaptionPanel,
  })),
);
const UpscalePanel = lazy(() =>
  import("./trainkit/panels/upscale-panel").then((m) => ({
    default: m.UpscalePanel,
  })),
);
const RenamePanel = lazy(() =>
  import("./trainkit/panels/rename-panel").then((m) => ({
    default: m.RenamePanel,
  })),
);
const LogsPanel = lazy(() =>
  import("./trainkit/panels/logs-panel").then((m) => ({
    default: m.LogsPanel,
  })),
);

export interface ProgressData {
  type: "progress";
  current: number;
  total: number;
  message: string;
  percent: number;
}

interface AppProps {
  isBackendOnline: boolean;
  progress: ProgressData | null;
}

export function App({ isBackendOnline, progress }: AppProps) {
  const [activeTab, setActiveTab] = useState<ServiceTab>("caption");

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TitleBar isBackendOnline={isBackendOnline} />
      <Header />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 overflow-hidden bg-background">
        <Suspense fallback={<PanelSkeleton />}>
          {activeTab === "caption" && (
            <CaptionPanel isBackendOnline={isBackendOnline} progress={progress} />
          )}
          {activeTab === "upscale" && (
            <UpscalePanel isBackendOnline={isBackendOnline} progress={progress} />
          )}
          {activeTab === "rename" && (
            <RenamePanel isBackendOnline={isBackendOnline} progress={progress} />
          )}
          {activeTab === "logs" && (
            <LogsPanel isBackendOnline={isBackendOnline} />
          )}
        </Suspense>
      </main>
    </div>
  );
}
