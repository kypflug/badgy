/** Holds the current signed-in account for the UI (set once at boot). */
export interface Session {
  name: string;
  email: string;
  id: string;
  signOut: () => void;
}

let current: Session | null = null;

export function setSession(s: Session | null): void {
  current = s;
}

export function getSession(): Session | null {
  return current;
}
