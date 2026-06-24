import {
  type AppData,
  CFG_ACTIVE,
  CFG_TARGET,
  computeWeeks,
  type DayKey,
  type Doc,
  dayKey,
  defaultMeetup,
  defaultStatus,
  emptyDoc,
  Hlc,
  materialize,
  meetupKey,
  merge,
  type Status,
  setCell,
  totals,
  type WeekComputed,
  type YearData,
  yearKey,
} from '@rto/shared';
import type { SyncTransport } from '../sync/types.js';

const PUSH_DEBOUNCE = 800;
const PULL_INTERVAL = 30_000;
const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

function docEqual(a: Doc, b: Doc): boolean {
  const ak = Object.keys(a.cells);
  if (ak.length !== Object.keys(b.cells).length) return false;
  for (const k of ak) {
    const ca = a.cells[k];
    const cb = b.cells[k];
    if (!cb || ca.v !== cb.v || ca.t[0] !== cb.t[0] || ca.t[1] !== cb.t[1]) return false;
  }
  return true;
}

/**
 * Reactive store backed by a CRDT sync engine. Edits update a local LWW doc (cached in
 * localStorage), re-render optimistically, and debounce a pull→merge→push to the user's
 * OneDrive app folder. Public API is unchanged, so components are untouched.
 */
export class Store extends EventTarget {
  private doc: Doc = emptyDoc();
  private data: AppData = materialize(this.doc);
  private readonly hlc = new Hlc();
  private transport: SyncTransport | null = null;
  private cacheKey = 'badgy:doc';
  private etag: string | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | undefined;
  private syncChain: Promise<void> = Promise.resolve();

  async start(transport: SyncTransport, cacheKey: string): Promise<void> {
    this.transport = transport;
    this.cacheKey = cacheKey;
    this.loadCache();
    this.rematerialize();
    await this.sync();
    window.addEventListener('focus', () => void this.sync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.sync();
    });
    setInterval(() => void this.sync(), PULL_INTERVAL);
  }

  get settings(): AppData['settings'] {
    return this.data.settings;
  }
  get activeYear(): number {
    return this.data.settings.activeYear;
  }
  get years(): number[] {
    return Object.keys(this.data.years)
      .map(Number)
      .sort((a, b) => a - b);
  }
  year(y = this.activeYear): YearData {
    return this.data.years[y] ?? { year: y, weeks: [] };
  }
  computed(y = this.activeYear): WeekComputed[] {
    return computeWeeks(this.year(y).weeks);
  }
  totals(y = this.activeYear): { officeDays: number; dtoDays: number } {
    return totals(this.year(y).weeks);
  }

  setStatus(weekStart: string, day: DayKey, status: Status): void {
    this.apply((d) => setCell(d, dayKey(this.activeYear, weekStart, day), status, this.hlc.tick()));
  }
  setWholeWeek(weekStart: string, status: Status): void {
    this.apply((d) => {
      for (const day of DAYS) {
        setCell(d, dayKey(this.activeYear, weekStart, day), status, this.hlc.tick());
      }
    });
  }
  toggleMeetup(weekStart: string): void {
    const cur = this.year().weeks.find((w) => w.weekStart === weekStart)?.meetup ?? false;
    this.apply((d) => setCell(d, meetupKey(this.activeYear, weekStart), !cur, this.hlc.tick()));
  }
  setTarget(target: number): void {
    const t = Math.min(1, Math.max(0, target));
    this.apply((d) => setCell(d, CFG_TARGET, t, this.hlc.tick()));
  }
  setActiveYear(y: number): void {
    this.apply((d) => {
      setCell(d, yearKey(y), true, this.hlc.tick());
      setCell(d, CFG_ACTIVE, y, this.hlc.tick());
    });
  }
  addYear(y: number): void {
    this.apply((d) => setCell(d, yearKey(y), true, this.hlc.tick()));
  }
  resetActiveYear(): void {
    const y = this.activeYear;
    this.apply((d) => {
      for (const key of Object.keys(d.cells)) {
        if (key.startsWith(`d|${y}|`)) {
          const [, , ws, day] = key.split('|');
          setCell(d, key, defaultStatus(y, ws, day as DayKey), this.hlc.tick());
        } else if (key.startsWith(`m|${y}|`)) {
          const [, , ws] = key.split('|');
          setCell(d, key, defaultMeetup(y, ws), this.hlc.tick());
        }
      }
    });
  }

  private apply(mutate: (d: Doc) => void): void {
    mutate(this.doc);
    this.saveCache();
    this.rematerialize();
    this.schedulePush();
  }

  private rematerialize(): void {
    this.data = materialize(this.doc);
    this.dispatchEvent(new Event('change'));
  }

  private loadCache(): void {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (raw) this.doc = JSON.parse(raw) as Doc;
    } catch {
      // ignore corrupt cache
    }
  }
  private saveCache(): void {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(this.doc));
    } catch {
      // ignore quota / private-mode errors
    }
  }

  private schedulePush(): void {
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.sync(), PUSH_DEBOUNCE);
  }

  private sync(): Promise<void> {
    this.syncChain = this.syncChain.then(() => this.syncOnce()).catch(() => undefined);
    return this.syncChain;
  }

  private async syncOnce(): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await transport.getRemote();
      if (remote) {
        for (const k of Object.keys(remote.doc.cells)) this.hlc.observe(remote.doc.cells[k].t);
        this.doc = merge(this.doc, remote.doc);
        this.etag = remote.etag;
      }
      this.saveCache();
      this.rematerialize();

      const needsPush = !remote || !docEqual(this.doc, remote.doc);
      if (!needsPush) return;
      const res = await transport.putRemote(this.doc, remote ? this.etag : null);
      if (res === 'conflict') continue; // re-pull + merge + retry
      this.etag = res.etag;
      return;
    }
  }
}

export const store = new Store();
