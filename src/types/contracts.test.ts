import { describe, expect, it } from "vitest";
import { isJobEvent, isLogEvent, mergeJobRecords, type JobRecord } from "./contracts";

describe("backend event guards", () => {
  it("accepts complete job events", () => {
    expect(
      isJobEvent({
        type: "job",
        job_id: "abc",
        operation: "rename",
        status: "running",
        current: 1,
        total: 2,
        percent: 50,
        message: "working",
        manifest_path: null,
        error: null,
        created_at: "2026-07-14T00:00:00Z",
        updated_at: "2026-07-14T00:00:01Z",
      }),
    ).toBe(true);
  });

  it("rejects malformed events", () => {
    expect(isJobEvent({ type: "job", job_id: "abc" })).toBe(false);
    expect(isJobEvent({ type: "job", operation: "delete", status: "running" })).toBe(false);
    expect(isLogEvent({ type: "log", message: "ready" })).toBe(false);
    expect(
      isLogEvent({ type: "log", level: "info", source: "backend", message: "ready" }),
    ).toBe(true);
  });
});

describe("job snapshot merging", () => {
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

  it("keeps a newer terminal event when an older snapshot arrives", () => {
    const completed = { ...job, status: "completed" as const, updated_at: "2026-07-14T00:00:02.000001+00:00" };
    const previous = Object.freeze({ abc: completed });
    expect(mergeJobRecords(previous, [job])).toBe(previous);
  });

  it("accepts cancellation responses without letting cached running events win", () => {
    const cancelling = { ...job, status: "cancelling" as const, updated_at: "2026-07-14T00:00:01.000002+00:00" };
    const previous = { abc: job };
    const next = mergeJobRecords(previous, [cancelling]);
    expect(next.abc).toBe(cancelling);
    expect(previous.abc).toBe(job);
    expect(mergeJobRecords(next, [job])).toBe(next);
  });
});
