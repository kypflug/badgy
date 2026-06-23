import type { MeResponse } from '@rto/shared';

export interface Session {
  /** Whether the server API is reachable (i.e. we're served by the server, not a static dev host). */
  apiAvailable: boolean;
  me: MeResponse | null;
}

const session: Session = { apiAvailable: false, me: null };

/** Probe `/api/me` once at startup to learn whether an API + identity are present. */
export async function probeSession(): Promise<Session> {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      session.apiAvailable = true;
      session.me = (await res.json()) as MeResponse;
    }
  } catch {
    // no API → standalone/local mode
  }
  return session;
}

export function getSession(): Session {
  return session;
}
