import { describe, expect, it } from "vitest";
import { isJobEvent, isLogEvent } from "./contracts";

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
