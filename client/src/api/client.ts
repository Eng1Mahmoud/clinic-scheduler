import type { ApiErrorBody } from "../types";

/** Base path the browser uses for the REST API (proxied to Express in dev). */
export const API_PREFIX = "/api";

/** Prefixes a server-relative API path (e.g. a `fileUrl`) for browser use. */
export function apiUrl(path: string): string {
  return `${API_PREFIX}${path}`;
}

/** Thrown for any non-2xx API response; carries the machine-readable code. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    let body: ApiErrorBody["error"] | null = null;
    try {
      body = ((await res.json()) as ApiErrorBody).error;
    } catch {
      // non-JSON error body — fall through to generic message
    }
    throw new ApiRequestError(
      res.status,
      body?.code ?? "REQUEST_FAILED",
      body?.message ?? `Request failed with status ${res.status}`,
      body?.details,
    );
  }

  return res.json() as Promise<T>;
}
