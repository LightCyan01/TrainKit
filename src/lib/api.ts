import type { BackendErrorEnvelope } from "@/types/contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const response = await window.electronAPI.backendRequest<T>({
    path,
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    body: options.body,
  });
  if (!response.ok) {
    const envelope = response.data as BackendErrorEnvelope;
    throw new ApiError(
      envelope.error?.message ?? `Backend request failed (${response.status})`,
      response.status,
      envelope.error?.code ?? "backend_error",
    );
  }
  return response.data as T;
}
