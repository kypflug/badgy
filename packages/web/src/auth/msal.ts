/**
 * Client auth via the BFF (token-mediating backend). No tokens live in the browser's storage:
 * the server holds the long-lived refresh token and we authenticate with an HttpOnly session
 * cookie. The browser fetches a short-lived Graph access token from /api/token and calls Graph
 * directly, so attendance data never transits our server.
 */

export const AUTH_INTERACTION_REQUIRED = 'auth_interaction_required';

export interface AuthAccount {
  id: string;
  name: string;
  email: string;
}

/** Resolve the current session from the BFF cookie. Returns the account, or null if signed out. */
export async function initAuth(): Promise<AuthAccount | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      signedIn: boolean;
      id: string;
      name: string;
      email: string;
    };
    return data.signedIn ? { id: data.id, name: data.name, email: data.email } : null;
  } catch {
    return null;
  }
}

export function signIn(): void {
  window.location.assign('/api/auth/login');
}

/** Re-establish the session after it lapses (rare — e.g. >7 days idle on iOS/Safari). */
export function reconnect(): void {
  window.location.assign('/api/auth/login');
}

export async function signOut(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.assign('/');
  }
}

let cached: { token: string; exp: number } | null = null;

/** A Graph access token brokered by the BFF, cached client-side until ~1 min before expiry. */
export async function getGraphToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.exp - 60_000 > now) return cached.token;
  const res = await fetch('/api/token', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'x-requested-with': 'badgy' },
  });
  if (res.status === 401 || res.status === 403) {
    cached = null;
    throw new Error(AUTH_INTERACTION_REQUIRED);
  }
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = (await res.json()) as { accessToken: string; expiresOn: string | null };
  cached = {
    token: data.accessToken,
    exp: data.expiresOn ? new Date(data.expiresOn).getTime() : now + 50 * 60_000,
  };
  return data.accessToken;
}
