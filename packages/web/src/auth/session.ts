/** Holds the current signed-in account for the UI (set once at boot). */
import type { ProviderId } from './provider.js';

export interface Session {
  name: string;
  email: string;
  id: string;
  provider: ProviderId;
  signOut: () => Promise<boolean>;
}

let current: Session | null = null;

export function setSession(s: Session | null): void {
  current = s;
}

export function getSession(): Session | null {
  return current;
}
