import type { AppData } from '@rto/shared';

export type { AppData };

/** Storage backend for the user's app data. */
export interface Persistence {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}

const KEY = 'rto-dashboard:v1';

/** Browser-local storage (standalone / signed-out use). */
export class LocalPersistence implements Persistence {
  async load(): Promise<AppData | null> {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AppData) : null;
    } catch {
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    localStorage.setItem(KEY, JSON.stringify(data));
  }
}

/** Server-backed storage (private per signed-in user) via the REST API. */
export class ApiPersistence implements Persistence {
  async load(): Promise<AppData | null> {
    try {
      const res = await fetch('/api/data', { headers: { accept: 'application/json' } });
      if (!res.ok) return null;
      return (await res.json()) as AppData | null;
    } catch {
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    try {
      await fetch('/api/data', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch {
      // optimistic: ignore transient failures; next save retries
    }
  }
}
