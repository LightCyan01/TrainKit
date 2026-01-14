import "./index.css";
import ReactDOM from "react-dom/client";
import { useState, useEffect } from "react";

declare global {
  interface Window {
    electronAPI: {
      getBackendStatus: () => Promise<{ status: string; isRunning: boolean; url: string }>;
      onBackendReady: (callback: () => void) => () => void;
    };
  }
}

const StatusIndicator = ({ isOnline }: { isOnline: boolean }) => (
  <div className="status-indicator">
    <span
      className={`status-dot ${isOnline ? "online" : "offline"}`}
      aria-label={isOnline ? "Backend online" : "Backend offline"}
    />
    <span className="status-text">
      Backend: {isOnline ? "Online" : "Connecting..."}
    </span>
  </div>
);

const App = () => {
  const [isBackendOnline, setIsBackendOnline] = useState(false);

  useEffect(() => {
    // Guard: only interact with API if available
    if (!window.electronAPI) return;

    // Non-blocking status check
    window.electronAPI
      .getBackendStatus()
      .then((status) => setIsBackendOnline(status.isRunning))
      .catch(() => {}); // Ignore errors on initial check

    // Listen for backend ready event
    const cleanup = window.electronAPI.onBackendReady(() => {
      setIsBackendOnline(true);
    });

    return cleanup;
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>TrainKit</h1>
        <StatusIndicator isOnline={isBackendOnline} />
      </header>
      <main className="app-main">
        <p>Dataset preparation toolkit for AI image training</p>
      </main>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);
