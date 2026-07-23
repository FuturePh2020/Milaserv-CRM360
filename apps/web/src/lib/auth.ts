export type AppRole = "TEAM_LEADER" | "SHIFT_SUPERVISOR" | "AGENT";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  teamId: string | null;
}

const TOKEN_KEY = "milaserv_access_token";
const USER_KEY = "milaserv_user";

// Session-lifetime only, matching the short-lived access token (spec 4/23):
// a browser tab close means signing in again, not a silently-persisted session.
export function saveSession(accessToken: string, user: SessionUser) {
  sessionStorage.setItem(TOKEN_KEY, accessToken);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function homePathForRole(role: AppRole): string {
  return role === "AGENT" ? "/agent" : "/dashboard";
}
