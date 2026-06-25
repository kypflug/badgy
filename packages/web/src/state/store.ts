import {
  addDays,
  beltForWeek,
  type CellValue,
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
  isMeetupWeek as isMeetupBuiltin,
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
import { AUTH_INTERACTION_REQUIRED } from '../auth/msal.js';
import type { SyncTransport } from '../sync/types.js';

const PUSH_DEBOUNCE = 800;
const PULL_INTERVAL = 30_000;
const MAX_HISTORY = 200;

/** A reversible edit: the changed keys mapped to their value (undefined = key was absent). */
type Patch = Record<string, CellValue | undefined>;
interface HistoryEntry {
  undo: Patch;
  redo: Patch;
}

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
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private authPaused = false;

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
  /** Reset many days to their defaults in a single undoable step. */
  clearRange(dates: readonly string[]): void {
    this.apply((d) => {
      for (const dt of dates) setCell(d, dateKey(dt), this.defaultStatusFor(dt), this.hlc.tick());
    });
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

  // --- history (undo / redo) ---
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.applyPatch(entry.undo);
    this.redoStack.push(entry);
    return true;
  }
  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.applyPatch(entry.redo);
    this.undoStack.push(entry);
    return true;
  }
  /** Re-apply a patch with fresh stamps so it wins LWW and syncs; absent values restore defaults. */
  private applyPatch(patch: Patch): void {
    this.commit((d) => {
      for (const k of Object.keys(patch)) {
        const want = patch[k] ?? this.cellDefault(k);
        if (d.cells[k]?.v !== want) setCell(d, k, want, this.hlc.tick());
      }
    });
  }
  private snapshot(): Record<string, CellValue> {
    const out: Record<string, CellValue> = {};
    for (const k of Object.keys(this.doc.cells)) out[k] = this.doc.cells[k].v;
    return out;
  }
  /** The value an absent cell resolves to — used to reverse a first-time edit. */
  private cellDefault(key: string): CellValue {
    if (key.startsWith('d|')) return this.defaultStatusFor(key.slice(2));
    if (key.startsWith('pat|')) return 'office';
    if (key.startsWith('m|')) return isMeetupBuiltin(key.slice(2));
    if (key === CFG_TARGET) return 0.8;
    return 'none';
  }

  // --- engine internals ---
  /** A user edit: apply it, persist + sync, and record a reversible undo step. */
  private apply(mutate: (d: Doc) => void): void {
    const before = this.snapshot();
    this.commit(mutate);
    const after = this.snapshot();
    const undo: Patch = {};
    const redo: Patch = {};
    let changed = false;
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[k] !== after[k]) {
        undo[k] = before[k];
        redo[k] = after[k];
        changed = true;
      }
    }
    if (changed) {
      this.undoStack.push({ undo, redo });
      if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      this.redoStack = [];
    }
  }
  private commit(mutate: (d: Doc) => void): void {
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
    this.syncChain = this.syncChain
      .then(() => this.syncOnce())
      .then(() => this.setAuthPaused(false))
      .catch((err) => {
        // Auth lapsed (e.g. iOS/Safari ITP) → pause and prompt reconnect, keep cached data.
        // Transient network errors leave the state unchanged and retry on the next tick.
        if (err instanceof Error && err.message === AUTH_INTERACTION_REQUIRED)
          this.setAuthPaused(true);
      });
    return this.syncChain;
  }
  /** True when OneDrive sync is paused because the session lapsed and needs interactive re-auth. */
  get needsReconnect(): boolean {
    return this.authPaused;
  }
  private setAuthPaused(v: boolean): void {
    if (this.authPaused !== v) {
      this.authPaused = v;
      this.emitChange();
    }
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
