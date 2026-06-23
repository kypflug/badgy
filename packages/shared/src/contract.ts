/** Wire contract shared by the web client and the API server. */
import type { YearData } from './types.js';

export interface AppSettings {
  activeYear: number;
  /** Target BELT as a fraction (e.g. 0.8). */
  targetBelt: number;
}

/** A user's full private dataset: tracked years + settings. */
export interface AppData {
  years: Record<number, YearData>;
  settings: AppSettings;
}

/** Identity surfaced by the server (from App Service Easy Auth, or a dev shim). */
export interface MeResponse {
  authenticated: boolean;
  id: string | null;
  name: string | null;
  email: string | null;
}
