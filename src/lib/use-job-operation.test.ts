import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useJobOperation } from "./use-job-operation";
import { apiRequest } from "./api";
import type { JobRecord } from "@/types/contracts";

const context = vi.hoisted(() => ({
  jobs: {} as Record<string, JobRecord>,
  addFrontendLog: vi.fn(),
  updateJob: vi.fn(),
}));
vi.mock("./websocket-context", () => ({ useWebSocket: () => context }));
vi.mock("./api", () => ({ apiRequest: vi.fn() }));

const job: JobRecord = {
  job_id: "abc",
  operation: "caption",
  status: "running",
  current: 0,
  total: 1,
  percent: 0,
  message: "working",
  manifest_path: null,
  error: null,
  created_at: "2026-07-14T00:00:00.000001+00:00",
  updated_at: "2026-07-14T00:00:01.000001+00:00",
};

function operation() {
  let captured: ReturnType<typeof useJobOperation>;
  function Harness(): null {
    captured = useJobOperation("caption");
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  return captured!;
}

describe("job submission and cancellation", () => {
  beforeEach(() => { vi.resetAllMocks(); context.jobs = {}; });

  it("blocks duplicate submissions and cancellation until the request returns", async () => {
    let resolveRequest: (record: JobRecord) => void;
    vi.mocked(apiRequest).mockReturnValue(new Promise<JobRecord>((resolve) => { resolveRequest = resolve; }));
    const caption = operation();
    const first = caption.start("/caption", {});
    await caption.start("/caption", {});
    await caption.cancel();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    resolveRequest!(job);
    await first;
    expect(context.updateJob).toHaveBeenCalledWith(job);
  });

  it("unlocks submission after a failure", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(job);
    const caption = operation();
    await expect(caption.start("/caption", {})).rejects.toThrow("offline");
    await caption.start("/caption", {});
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(context.updateJob).toHaveBeenCalledWith(job);
  });

  it("updates shared job state from cancellation and handles failures without a rejected click promise", async () => {
    context.jobs = { abc: job };
    const cancelled = { ...job, status: "cancelled" as const, updated_at: "2026-07-14T00:00:02.000001+00:00" };
    vi.mocked(apiRequest).mockResolvedValueOnce(cancelled).mockRejectedValueOnce(new Error("offline"));
    const caption = operation();
    await caption.cancel();
    expect(context.updateJob).toHaveBeenCalledWith(cancelled);
    await expect(caption.cancel()).resolves.toBeUndefined();
    expect(context.addFrontendLog).toHaveBeenLastCalledWith("error", "Could not cancel caption: offline");
  });
});
