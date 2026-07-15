import "./index.css";
import "./types/electron.d.ts";
import ReactDOM from "react-dom/client";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { App } from "./components/App";
import { WebSocketProvider } from "./lib/websocket-context";

function AppWithProviders() {
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  useEffect(() => {
    void window.electronAPI.getBackendStatus().then((status) => {
      setIsBackendOnline(status.isRunning);
    });
    const removeReady = window.electronAPI.onBackendReady(() => setIsBackendOnline(true));
    const removeStatus = window.electronAPI.onBackendStatus((status) => {
      setIsBackendOnline(status.isRunning);
    });
    return () => {
      removeReady();
      removeStatus();
    };
  }, []);
  return (
    <WebSocketProvider isBackendOnline={isBackendOnline}>
      <App isBackendOnline={isBackendOnline} />
    </WebSocketProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AppWithProviders />
  </ErrorBoundary>,
);
