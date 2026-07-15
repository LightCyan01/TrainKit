import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "./api";

describe("apiRequest", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { electronAPI: { backendRequest: vi.fn() } },
    });
  });

  it("returns typed response data", async () => {
    window.electronAPI.backendRequest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      data: { status: "ok" },
    });
    await expect(apiRequest<{ status: string }>("/health")).resolves.toEqual({
      status: "ok",
    });
  });

  it("raises the backend error envelope", async () => {
    window.electronAPI.backendRequest = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      data: { error: { code: "conflict", message: "busy" } },
    });
    await expect(apiRequest("/rename")).rejects.toEqual(
      new ApiError("busy", 409, "conflict"),
    );
  });
});
