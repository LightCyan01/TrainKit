import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

export type PanelStatus = "idle" | "processing" | "success" | "error";

interface AppState {
  // Caption panel
  captionLoadPath: string;
  captionSavePath: string;
  captionModelPath: string;
  captionModelType: "file" | "folder";
  captionPrompt: string;
  captionStatus: PanelStatus;
  captionProcessedCount: number;
  captionImageIndex: number;

  // Upscale panel
  upscaleLoadPath: string;
  upscaleSavePath: string;
  upscaleModelPath: string;
  upscaleFormat: string;
  upscaleTiling: boolean;
  upscaleStatus: PanelStatus;
  upscaleProcessedCount: number;
  upscaleImageIndex: number;

  // Rename panel
  renameLoadPath: string;
  renameSavePath: string;
  renameMode: "sequential" | "stem_sequential";
  skipDuplicates: boolean;
  renameStatus: PanelStatus;
  renameProcessedCount: number;
}

interface AppStateContextValue extends AppState {
  // Caption setters
  setCaptionLoadPath: (path: string) => void;
  setCaptionSavePath: (path: string) => void;
  setCaptionModelPath: (path: string) => void;
  setCaptionModelType: (type: "file" | "folder") => void;
  setCaptionPrompt: (prompt: string) => void;
  setCaptionStatus: (status: PanelStatus) => void;
  setCaptionProcessedCount: (count: number) => void;
  setCaptionImageIndex: (index: number) => void;

  // Upscale setters
  setUpscaleLoadPath: (path: string) => void;
  setUpscaleSavePath: (path: string) => void;
  setUpscaleModelPath: (path: string) => void;
  setUpscaleFormat: (format: string) => void;
  setUpscaleTiling: (tiling: boolean) => void;
  setUpscaleStatus: (status: PanelStatus) => void;
  setUpscaleProcessedCount: (count: number) => void;
  setUpscaleImageIndex: (index: number) => void;

  // Rename setters
  setRenameLoadPath: (path: string) => void;
  setRenameSavePath: (path: string) => void;
  setRenameMode: (mode: "sequential" | "stem_sequential") => void;
  setSkipDuplicates: (skip: boolean) => void;
  setRenameStatus: (status: PanelStatus) => void;
  setRenameProcessedCount: (count: number) => void;
}

const defaultState: AppState = {
  // Caption
  captionLoadPath: "",
  captionSavePath: "",
  captionModelPath: "",
  captionModelType: "folder",
  captionPrompt: "",
  captionStatus: "idle",
  captionProcessedCount: 0,
  captionImageIndex: 0,

  // Upscale
  upscaleLoadPath: "",
  upscaleSavePath: "",
  upscaleModelPath: "",
  upscaleFormat: "PNG",
  upscaleTiling: true,
  upscaleStatus: "idle",
  upscaleProcessedCount: 0,
  upscaleImageIndex: 0,

  // Rename
  renameLoadPath: "",
  renameSavePath: "",
  renameMode: "sequential",
  skipDuplicates: false,
  renameStatus: "idle",
  renameProcessedCount: 0,
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState);

  // Caption setters
  const setCaptionLoadPath = useCallback((path: string) => {
    setState((prev) => ({ ...prev, captionLoadPath: path }));
  }, []);

  const setCaptionSavePath = useCallback((path: string) => {
    setState((prev) => ({ ...prev, captionSavePath: path }));
  }, []);

  const setCaptionModelPath = useCallback((path: string) => {
    setState((prev) => ({ ...prev, captionModelPath: path }));
  }, []);

  const setCaptionModelType = useCallback((type: "file" | "folder") => {
    setState((prev) => ({
      ...prev,
      captionModelType: type,
      captionModelPath: "",
    }));
  }, []);

  const setCaptionPrompt = useCallback((prompt: string) => {
    setState((prev) => ({ ...prev, captionPrompt: prompt }));
  }, []);

  const setCaptionStatus = useCallback((status: PanelStatus) => {
    setState((prev) => ({ ...prev, captionStatus: status }));
  }, []);

  const setCaptionProcessedCount = useCallback((count: number) => {
    setState((prev) => ({ ...prev, captionProcessedCount: count }));
  }, []);

  const setCaptionImageIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, captionImageIndex: index }));
  }, []);

  // Upscale setters
  const setUpscaleLoadPath = useCallback((path: string) => {
    setState((prev) => ({ ...prev, upscaleLoadPath: path }));
  }, []);

  const setUpscaleSavePath = useCallback((path: string) => {
    setState((prev) => ({ ...prev, upscaleSavePath: path }));
  }, []);

  const setUpscaleModelPath = useCallback((path: string) => {
    setState((prev) => ({ ...prev, upscaleModelPath: path }));
  }, []);

  const setUpscaleFormat = useCallback((format: string) => {
    setState((prev) => ({ ...prev, upscaleFormat: format }));
  }, []);

  const setUpscaleTiling = useCallback((tiling: boolean) => {
    setState((prev) => ({ ...prev, upscaleTiling: tiling }));
  }, []);

  const setUpscaleStatus = useCallback((status: PanelStatus) => {
    setState((prev) => ({ ...prev, upscaleStatus: status }));
  }, []);

  const setUpscaleProcessedCount = useCallback((count: number) => {
    setState((prev) => ({ ...prev, upscaleProcessedCount: count }));
  }, []);

  const setUpscaleImageIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, upscaleImageIndex: index }));
  }, []);

  // Rename setters
  const setRenameLoadPath = useCallback((path: string) => {
    setState((prev) => ({ ...prev, renameLoadPath: path }));
  }, []);

  const setRenameSavePath = useCallback((path: string) => {
    setState((prev) => ({ ...prev, renameSavePath: path }));
  }, []);

  const setRenameMode = useCallback(
    (mode: "sequential" | "stem_sequential") => {
      setState((prev) => ({ ...prev, renameMode: mode }));
    },
    [],
  );

  const setSkipDuplicates = useCallback((skip: boolean) => {
    setState((prev) => ({ ...prev, skipDuplicates: skip }));
  }, []);

  const setRenameStatus = useCallback((status: PanelStatus) => {
    setState((prev) => ({ ...prev, renameStatus: status }));
  }, []);

  const setRenameProcessedCount = useCallback((count: number) => {
    setState((prev) => ({ ...prev, renameProcessedCount: count }));
  }, []);

  const value = useMemo<AppStateContextValue>(() => ({
    ...state,
    setCaptionLoadPath,
    setCaptionSavePath,
    setCaptionModelPath,
    setCaptionModelType,
    setCaptionPrompt,
    setCaptionStatus,
    setCaptionProcessedCount,
    setCaptionImageIndex,
    setUpscaleLoadPath,
    setUpscaleSavePath,
    setUpscaleModelPath,
    setUpscaleFormat,
    setUpscaleTiling,
    setUpscaleStatus,
    setUpscaleProcessedCount,
    setUpscaleImageIndex,
    setRenameLoadPath,
    setRenameSavePath,
    setRenameMode,
    setSkipDuplicates,
    setRenameStatus,
    setRenameProcessedCount,
  }), [
    state,
    setCaptionLoadPath,
    setCaptionSavePath,
    setCaptionModelPath,
    setCaptionModelType,
    setCaptionPrompt,
    setCaptionStatus,
    setCaptionProcessedCount,
    setCaptionImageIndex,
    setUpscaleLoadPath,
    setUpscaleSavePath,
    setUpscaleModelPath,
    setUpscaleFormat,
    setUpscaleTiling,
    setUpscaleStatus,
    setUpscaleProcessedCount,
    setUpscaleImageIndex,
    setRenameLoadPath,
    setRenameSavePath,
    setRenameMode,
    setSkipDuplicates,
    setRenameStatus,
    setRenameProcessedCount,
  ]);

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}
