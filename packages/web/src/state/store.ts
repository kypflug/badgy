import {
  addDays,
  beltForWeek,
  CFG_TARGET,
  type Compliance,
  compliance as computeCompliance,
  type Doc,
  dateKey,
  emptyDoc,
  getPattern,
  getTarget,
  Hlc,
  isHolidayDate,
  isMeetupOverride,
  isWeekend,
  meetupKey,
  merge,
  migrate,
  monthGrid,
  officeDaysByWeek,
  type ProjectionResult,
  patternKey,
  type ResolvedDay,
  requiredOfficeDays,
  resolveDay,
  resolveRange,
  type Status,
  setCell,
  todayISO,
  type Weekday,
  weekdayOf,
} from '@rto/shared';
import type { SyncTransport } from '../sync/types.js';

const PUSH_DEBOUNCE = 800;
const PULL_INTERVAL = 30_000;

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
 * Reactive store + CRDT sync engine. Edits update a local per-date doc (localStorage cache),
 * re-render optimistically, and debounce a pull→merge→push to the user's OneDrive app folder.
 * Reads resolve the sparse doc into calendar views on demand.
 */
export class Store extends EventTarget {
  private doc: Doc = emptyDoc();
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
    this.emitChange();
    // Render immediately from the local cache; pull from OneDrive in the background
    // so first paint after sign-in never waits on a token + Graph round-trip.
    void this.sync();
    window.addEventListener('focus', () => void this.sync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.sync();
    });
    setInterval(() => void this.sync(), PULL_INTERVAL);
  }

  // --- reads ---
  today(): string {
    return todayISO();
  }
  get target(): number {
    return getTarget(this.doc);
  }
  get pattern(): Partial<Record<Weekday, Status>> {
    return getPattern(this.doc);
  }
  resolve(date: string): ResolvedDay {
    return resolveDay(this.doc, date);
  }
  /** Resolved days for the full month grid (leading/trailing weeks included). */
  monthDays(year: number, month0: number): ResolvedDay[] {
    const { mondays } = monthGrid(year, month0);
    return resolveRange(this.doc, mondays[0], addDays(mondays[mondays.length - 1], 6));
  }
  monthMondays(year: number, month0: number): string[] {
    return monthGrid(year, month0).mondays;
  }
  weekDays(monday: string): ResolvedDay[] {
    return resolveRange(this.doc, monday, addDays(monday, 6));
  }
  weekBelt(monday: string): number | null {
    return beltForWeek(this.doc, monday, todayISO());
  }
  weekOffice(monday: string): number {
    return officeDaysByWeek(this.doc, [monday], todayISO())[0];
  }
  compliance(): Compliance {
    return computeCompliance(this.doc, this.target, todayISO());
  }
  plan(horizon: number, hold: boolean): ProjectionResult {
    return requiredOfficeDays(this.doc, todayISO(), horizon, this.target, hold);
  }
  isMeetupWeek(weekStart: string): boolean {
    return isMeetupOverride(this.doc, weekStart);
  }

  // --- writes ---
  setStatus(date: string, status: Status): void {
    this.apply((d) => setCell(d, dateKey(date), status, this.hlc.tick()));
  }
  setRange(dates: readonly string[], status: Status): void {
    this.apply((d) => {
      for (const dt of dates) setCell(d, dateKey(dt), status, this.hlc.tick());
    });
  }
  /** Reset a day to its default (pattern / holiday / weekend), since LWW has no delete. */
  clearDate(date: string): void {
    const def = this.defaultStatusFor(date);
    this.apply((d) => setCell(d, dateKey(date), def, this.hlc.tick()));
  }
  setPattern(weekday: Weekday, status: Status): void {
    this.apply((d) => setCell(d, patternKey(weekday), status, this.hlc.tick()));
  }
  setTarget(target: number): void {
    const t = Math.min(1, Math.max(0, target));
    this.apply((d) => setCell(d, CFG_TARGET, t, this.hlc.tick()));
  }
  toggleMeetup(weekStart: string): void {
    const cur = this.isMeetupWeek(weekStart);
    this.apply((d) => setCell(d, meetupKey(weekStart), !cur, this.hlc.tick()));
  }
  importDays(entries: readonly { date: string; status: Status }[]): void {
    this.apply((d) => {
      for (const e of entries) setCell(d, dateKey(e.date), e.status, this.hlc.tick());
    });
  }

  private defaultStatusFor(date: string): Status {
    const wd = weekdayOf(date);
    if (isWeekend(wd)) return 'none';
    if (isHolidayDate(date)) return 'holiday';
    return this.pattern[wd] ?? 'office';
  }

  // --- engine internals ---
  private apply(mutate: (d: Doc) => void): void {
    mutate(this.doc);
    this.saveCache();
    this.emitChange();
    this.schedulePush();
  }
  private emitChange(): void {
    this.dispatchEvent(new Event('change'));
  }
  private loadCache(): void {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (raw) this.doc = migrate(JSON.parse(raw) as Doc);
    } catch {
      // ignore corrupt cache
    }
  }
  private saveCache(): void {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(this.doc));
    } catch {
      // ignore quota / private mode
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
        const remoteDoc = migrate(remote.doc);
        for (const k of Object.keys(remoteDoc.cells)) this.hlc.observe(remoteDoc.cells[k].t);
        this.doc = merge(this.doc, remoteDoc);
        this.etag = remote.etag;
      }
      this.saveCache();
      this.emitChange();
      const needsPush = !remote || !docEqual(this.doc, migrate(remote.doc));
      if (!needsPush) return;
      const res = await transport.putRemote(this.doc, remote ? this.etag : null);
      if (res === 'conflict') continue;
      this.etag = res.etag;
      return;
    }
  }
}

export const store = new Store();
