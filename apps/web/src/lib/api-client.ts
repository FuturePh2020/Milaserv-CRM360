import { clearSession, getAccessToken, saveSession } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return false;
        const body = await res.json();
        saveSession(body.accessToken, body.user);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** Authenticated JSON fetch. Retries once via the httpOnly refresh cookie on a 401, then gives up. */
export async function apiFetch<T>(path: string, init: RequestInit = {}, _retried = false): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body && !(init.headers as Record<string, string>)?.["Content-Type"] ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && !_retried) {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch<T>(path, init, true);
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(401, "Session expired.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Request failed (${res.status}).`);
  }

  // A 204, or a 200 with an empty body (Nest sends Content-Length: 0 for a
  // controller returning `null`, e.g. GET /sessions/current with no open
  // session) - res.json() throws SyntaxError on an empty string, which
  // would otherwise silently leave the UI showing stale cached data.
  const text = await res.text();
  if (res.status === 204 || text.length === 0) return null as T;
  return JSON.parse(text) as T;
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
