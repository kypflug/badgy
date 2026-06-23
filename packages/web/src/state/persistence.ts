import type { YearData } from '@rto/shared';

export interface AppSettings {
  activeYear: number;
  /** Target BELT as a fraction (e.g. 0.8) for the planner + dashboard. */
  targetBelt: number;
}

export interface AppData {
  years: Record<number, YearData>;
  settings: AppSettings;
}

/** Storage backend. LocalPersistence now; an API-backed one lands in P3. */
export interface Persistence {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}

const KEY = 'rto-dashboard:v1';

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
