import { lazy, Suspense, useState } from "react";
import { Header } from "./trainkit/Header";
import { Navigation, type ServiceTab } from "./trainkit/Navigation";
import { TitleBar } from "./trainkit/TitleBar";
import { PanelSkeleton } from "./trainkit/shared/PanelSkeleton";

const CaptionPanel = lazy(() =>
  import("./trainkit/panels/caption-panel").then((module) => ({ default: module.CaptionPanel })),
);
const UpscalePanel = lazy(() =>
  import("./trainkit/panels/upscale-panel").then((module) => ({ default: module.UpscalePanel })),
);
const RenamePanel = lazy(() =>
  import("./trainkit/panels/rename-panel").then((module) => ({ default: module.RenamePanel })),
);
const TagPanel = lazy(() =>
  import("./trainkit/panels/tag-panel").then((module) => ({ default: module.TagPanel })),
);
const LogsPanel = lazy(() =>
  import("./trainkit/panels/logs-panel").then((module) => ({ default: module.LogsPanel })),
);

export function App({ isBackendOnline }: { isBackendOnline: boolean }) {
  const [activeTab, setActiveTab] = useState<ServiceTab>("caption");
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar isBackendOnline={isBackendOnline} />
      <Header />
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-hidden bg-background">
        <Suspense fallback={<PanelSkeleton />}>
          <div className={activeTab === "caption" ? "h-full" : "hidden"}><CaptionPanel isBackendOnline={isBackendOnline} /></div>
          <div className={activeTab === "upscale" ? "h-full" : "hidden"}><UpscalePanel isBackendOnline={isBackendOnline} /></div>
          <div className={activeTab === "rename" ? "h-full" : "hidden"}><RenamePanel isBackendOnline={isBackendOnline} /></div>
          <div className={activeTab === "tag" ? "h-full" : "hidden"}><TagPanel isBackendOnline={isBackendOnline} /></div>
          <div className={activeTab === "logs" ? "h-full" : "hidden"}><LogsPanel isBackendOnline={isBackendOnline} /></div>
        </Suspense>
      </main>
    </div>
  );
}
