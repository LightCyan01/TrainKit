import "./index.css";
import "./types/electron.d.ts";
import ReactDOM from "react-dom/client";
import { useState, useEffect } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { App } from "./components/App";
import { AppStateProvider } from "./lib/app-state";
import { WebSocketProvider, useWebSocket } from "./lib/websocket-context";

// Main app container that consumes WebSocket context
const AppContainer = ({ isBackendOnline }: { isBackendOnline: boolean }) => {
  const { progress } = useWebSocket();
  return <App isBackendOnline={isBackendOnline} progress={progress} />;
};

// Single wrapper component that manages backend status and provides contexts
const AppWithProviders = () => {
  const [isBackendOnline, setIsBackendOnline] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    // Check initial backend status
    window.electronAPI
      .getBackendStatus()
      .then((status) => {
        setIsBackendOnline(status.isRunning);
      })
      .catch(() => {}); // Ignore

    // Listen for backend ready event
    const cleanup = window.electronAPI.onBackendReady(() => {
      setIsBackendOnline(true);
    });

    return cleanup;
  }, []);

  return (
    <WebSocketProvider isBackendOnline={isBackendOnline}>
      <AppContainer isBackendOnline={isBackendOnline} />
    </WebSocketProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <ErrorBoundary>
    <AppStateProvider>
      <AppWithProviders />
    </AppStateProvider>
  </ErrorBoundary>,
);
