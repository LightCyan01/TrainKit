import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocketProvider } from "./websocket-context";
import { apiRequest } from "./api";
import type { BackendEvent, JobRecord } from "@/types/contracts";
import type { MainLogEntry } from "@/types/electron";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], effects: [] as (() => unknown)[] }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.states.push(initial) - 1;
    return [initial, (update: unknown) => {
      hooks.states[index] = typeof update === "function" ? update(hooks.states[index]) : update;
    }];
  },
  useEffect: (effect: () => unknown) => hooks.effects.push(effect),
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("./api", () => ({ apiRequest: vi.fn() }));

describe("renderer job bootstrap", () => {
  beforeEach(() => { vi.clearAllMocks(); hooks.states.length = 0; hooks.effects.length = 0; });

  it("fetches initial jobs and keeps a terminal event received before an older snapshot", async () => {
    let receiveEvent: (event: BackendEvent) => void;
    const cleanup = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { electronAPI: {
        onBackendEvent: (callback: typeof receiveEvent) => { receiveEvent = callback; return cleanup; },
        onMainLog: () => cleanup,
        getMainLogs: async (): Promise<MainLogEntry[]> => [],
      } },
    });
    let resolveSnapshot: (data: { jobs: JobRecord[] }) => void;
    const snapshot = new Promise<{ jobs: JobRecord[] }>((resolve) => { resolveSnapshot = resolve; });
    vi.mocked(apiRequest).mockReturnValue(snapshot);
    WebSocketProvider({ children: null, isBackendOnline: true });
    const removeListeners = hooks.effects[0]() as () => void;
    hooks.effects[1]();
    expect(apiRequest).toHaveBeenCalledWith("/jobs");

    const completed: JobRecord = {
      job_id: "abc", operation: "caption", status: "completed", current: 1, total: 1,
      percent: 100, message: "done", manifest_path: null, error: null,
      created_at: "2026-07-14T00:00:00.000001+00:00",
      updated_at: "2026-07-14T00:00:02.000001+00:00",
    };
    receiveEvent!({ ...completed, type: "job" });
    resolveSnapshot!({ jobs: [{ ...completed, status: "running", updated_at: "2026-07-14T00:00:01.000001+00:00" }] });
    await snapshot;
    expect((hooks.states[0] as Record<string, JobRecord>).abc.status).toBe("completed");
    expect((hooks.states[1] as JobRecord).status).toBe("completed");
    removeListeners();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
