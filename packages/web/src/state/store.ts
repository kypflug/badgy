import {
  addDays,
  type Band,
  bandOf,
  type CalendarNote,
  type CellValue,
  CFG_HOLIDAY_REGION,
  CFG_ORG,
  CFG_SCHEME,
  CFG_TARGET,
  type ComplianceResult,
  type ComplianceScheme,
  cellValueEqual,
  DEFAULT_HOLIDAY_REGION,
  DEFAULT_ORG_ID,
  type Doc,
  dateKey,
  emptyDoc,
  evaluate,
  getHolidayRegion,
  getNotes,
  getOrgId,
  getPattern,
  getSchemeOverride,
  getTarget,
  Hlc,
  type Holiday,
  type HolidayRegionId,
  holidayKey,
  holidayLabel,
  holidayNameFor,
  holidaysInYear,
  isCalendarNote,
  isHolidayOverride,
  isMeetupWeek as isMeetupBuiltin,
  isMeetupOverride,
  isWeekend,
  meetupKey,
  merge,
  migrate,
  monthGrid,
  noteKey,
  type OrgPreset,
  orgOrDefault,
  type ProjectionResult,
  patternKey,
  planOfficeDays,
  type ResolvedDay,
  resolveDay,
  resolveRange,
  type Status,
  setCell,
  todayISO,
  type Weekday,
  weekdayOf,
  weekScore,
  yearBounds,
} from '@badgy/shared';
import { AUTH_INTERACTION_REQUIRED } from '../auth/provider.js';
import type { SyncTransport } from '../sync/types.js';

const PUSH_DEBOUNCE = 800;
const PULL_INTERVAL = 30_000;
const MAX_HISTORY = 200;
const MAX_HOLIDAY_NAME = 80;
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** Collapse whitespace, strip control characters, and cap the length of an imported label. */
function normalizeHolidayName(name: string | undefined): string {
  if (!name) return '';
  return name.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_HOLIDAY_NAME);
}

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
    if (!cb || !cellValueEqual(ca.v, cb.v) || ca.t[0] !== cb.t[0] || ca.t[1] !== cb.t[1])
      return false;
  }
  return true;
}

/**
 * Reactive store + CRDT sync engine. Edits update a local per-date doc (localStorage cache),
 * re-render optimistically, and debounce a pull→merge→push to the user's cloud app folder.
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
  private syncUnavailable = false;
  /** The preset this visit arrived under; only seeded into the doc once the first pull confirms it's new. */
  private entryOrg: OrgPreset = orgOrDefault(DEFAULT_ORG_ID);
  private seeded = false;

  async start(transport: SyncTransport, cacheKey: string, entryOrg?: OrgPreset): Promise<void> {
    this.transport = transport;
    this.cacheKey = cacheKey;
    if (entryOrg) this.entryOrg = entryOrg;
    this.loadCache();
    this.emitChange();
    // Render immediately from the local cache; pull in the background so first paint after
    // sign-in never waits on a token + storage round-trip.
    void this.sync();
    window.addEventListener('focus', () => void this.sync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.sync();
    });
    setInterval(() => void this.sync(), PULL_INTERVAL);
  }

  /**
   * Write the entry preset's defaults, but only once a pull has proven the document has never
   * chosen one. Seeding on a failed or offline first sync would let whichever URL a returning user
   * happened to open silently overwrite the org they already picked on another device.
   */
  private seedOrgDefaults(): void {
    if (this.seeded) return;
    this.seeded = true;
    if (getOrgId(this.doc) !== null) return;
    const org = this.entryOrg;
    this.commit((d) => {
      setCell(d, CFG_ORG, org.id, this.hlc.tick());
      setCell(d, CFG_SCHEME, JSON.stringify(org.scheme), this.hlc.tick());
      if (d.cells[CFG_TARGET] === undefined) setCell(d, CFG_TARGET, org.target, this.hlc.tick());
      if (d.cells[CFG_HOLIDAY_REGION] === undefined)
        setCell(d, CFG_HOLIDAY_REGION, org.holidaySet, this.hlc.tick());
      for (const [weekday, status] of Object.entries(org.pattern ?? {})) {
        const key = patternKey(Number(weekday) as Weekday);
        if (d.cells[key] === undefined) setCell(d, key, status, this.hlc.tick());
      }
    });
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
    const { weekStarts } = monthGrid(year, month0);
    return resolveRange(this.doc, weekStarts[0], addDays(weekStarts[weekStarts.length - 1], 6));
  }
  monthWeekStarts(year: number, month0: number): string[] {
    return monthGrid(year, month0).weekStarts;
  }
  yearDays(year: number): ResolvedDay[] {
    const { start, end } = yearBounds(year);
    return resolveRange(this.doc, start, end);
  }
  weekDays(weekStart: string): ResolvedDay[] {
    return resolveRange(this.doc, weekStart, addDays(weekStart, 6));
  }
  /** The org preset backing the current defaults. */
  get org(): OrgPreset {
    return orgOrDefault(getOrgId(this.doc) ?? this.entryOrg.id);
  }
  /** The active rule: the user's customization if they've made one, else the org's. */
  get scheme(): ComplianceScheme {
    return getSchemeOverride(this.doc) ?? this.org.scheme;
  }
  /** True once the user has edited the scheme away from their org's preset. */
  get schemeIsCustom(): boolean {
    const override = getSchemeOverride(this.doc);
    return override !== null && JSON.stringify(override) !== JSON.stringify(this.org.scheme);
  }
  band(value: number): Band {
    return bandOf(value, this.scheme.bands);
  }
  /** The scheme's rolling score as of a given week, for the calendar's per-week column. */
  weekScore(weekStart: string): number | null {
    return weekScore(this.doc, weekStart, this.scheme, todayISO());
  }
  compliance(): ComplianceResult {
    return evaluate(this.doc, this.scheme, this.target, todayISO());
  }
  plan(horizon: number, hold: boolean): ProjectionResult {
    return planOfficeDays(this.doc, this.scheme, todayISO(), horizon, this.target, hold);
  }
  isMeetupWeek(weekStart: string): boolean {
    return isMeetupOverride(this.doc, weekStart);
  }
  get holidayRegion(): HolidayRegionId {
    return getHolidayRegion(this.doc);
  }
  /** Every holiday resolved for the year: region defaults plus the user's own edits. */
  holidaysInYear(year: number): Holiday[] {
    const region = this.holidayRegion;
    const dates = new Set(holidaysInYear(region, year).map((h) => h.date));
    const prefix = `${String(year).padStart(4, '0')}-`;
    for (const key of Object.keys(this.doc.cells)) {
      if (!key.startsWith('h|')) continue;
      const date = key.slice(2);
      if (!date.startsWith(prefix)) continue;
      if (this.doc.cells[key].v) dates.add(date);
      else dates.delete(date);
    }
    return [...dates]
      .sort()
      .map((date) => ({ date, name: holidayLabel(this.doc, date) ?? 'Holiday' }));
  }
  isHoliday(date: string): boolean {
    return isHolidayOverride(this.doc, date);
  }
  holidayName(date: string): string | null {
    return holidayLabel(this.doc, date);
  }
  notesInRange(start: string, end: string): CalendarNote[] {
    return getNotes(this.doc, start, end);
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
  setHolidayRegion(region: HolidayRegionId): void {
    this.apply((d) => setCell(d, CFG_HOLIDAY_REGION, region, this.hlc.tick()));
  }
  /** Switch workplace: adopt its scheme, target and holidays as one undoable step. */
  setOrg(id: string): void {
    const org = orgOrDefault(id);
    this.apply((d) => {
      setCell(d, CFG_ORG, org.id, this.hlc.tick());
      setCell(d, CFG_SCHEME, JSON.stringify(org.scheme), this.hlc.tick());
      setCell(d, CFG_TARGET, org.target, this.hlc.tick());
      setCell(d, CFG_HOLIDAY_REGION, org.holidaySet, this.hlc.tick());
    });
  }
  setScheme(scheme: ComplianceScheme): void {
    this.apply((d) => setCell(d, CFG_SCHEME, JSON.stringify(scheme), this.hlc.tick()));
  }
  /** Drop customizations and go back to the workplace preset's own rule. */
  resetScheme(): void {
    this.setScheme(this.org.scheme);
  }
  /** Add a holiday, optionally under a custom name; `true` keeps the region's own label. */
  addHoliday(date: string, name?: string): void {
    const label = normalizeHolidayName(name);
    const value = label && label !== holidayNameFor(this.holidayRegion, date) ? label : true;
    this.apply((d) => setCell(d, holidayKey(date), value, this.hlc.tick()));
  }
  removeHoliday(date: string): void {
    this.apply((d) => setCell(d, holidayKey(date), false, this.hlc.tick()));
  }
  /** Merge imported days in one undoable step, skipping ones already resolved as holidays. */
  importHolidays(entries: readonly Holiday[]): number {
    const added = entries.filter((e) => !this.isHoliday(e.date));
    if (!added.length) return 0;
    this.apply((d) => {
      for (const entry of added) {
        const label = normalizeHolidayName(entry.name);
        const value =
          label && label !== holidayNameFor(this.holidayRegion, entry.date) ? label : true;
        setCell(d, holidayKey(entry.date), value, this.hlc.tick());
      }
    });
    return added.length;
  }
  /** Drop every per-date holiday edit so the region's defaults apply again. */
  resetHolidays(): void {
    const keys = Object.keys(this.doc.cells).filter((k) => k.startsWith('h|'));
    if (!keys.length) return;
    this.apply((d) => {
      for (const key of keys)
        setCell(d, key, holidayNameFor(this.holidayRegion, key.slice(2)) !== null, this.hlc.tick());
    });
  }
  createNote(start: string, end: string, label: string, color: string): CalendarNote {
    const note = this.normalizeNote({
      id: globalThis.crypto.randomUUID(),
      start,
      end,
      label,
      color,
    });
    this.apply((d) => setCell(d, noteKey(note.id), note, this.hlc.tick()));
    return note;
  }
  updateNote(note: CalendarNote): void {
    const normalized = this.normalizeNote(note);
    this.apply((d) => setCell(d, noteKey(normalized.id), normalized, this.hlc.tick()));
  }
  deleteNote(id: string): void {
    this.apply((d) => setCell(d, noteKey(id), null, this.hlc.tick()));
  }

  private defaultStatusFor(date: string): Status {
    const wd = weekdayOf(date);
    if (isHolidayOverride(this.doc, date)) return 'holiday';
    if (this.pattern[wd] != null) return this.pattern[wd];
    return isWeekend(wd) ? 'none' : 'office';
  }
  private normalizeNote(note: CalendarNote): CalendarNote {
    const label = note.label.trim();
    if (!label) throw new Error('A note label is required.');
    if (!note.id || note.id.includes('|')) throw new Error('Invalid note ID.');
    const [start, end] = note.start <= note.end ? [note.start, note.end] : [note.end, note.start];
    const color = note.color.toLowerCase();
    const normalized = { id: note.id, start, end, label, color };
    if (!isCalendarNote(normalized)) throw new Error('Invalid note range or color.');
    return normalized;
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
        const want = patch[k] === undefined ? this.cellDefault(k) : patch[k];
        if (!cellValueEqual(d.cells[k]?.v, want)) setCell(d, k, want, this.hlc.tick());
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
    if (key.startsWith('h|')) return holidayNameFor(this.holidayRegion, key.slice(2)) !== null;
    if (key.startsWith('n|')) return null;
    if (key === CFG_TARGET) return this.org.target;
    if (key === CFG_HOLIDAY_REGION) return DEFAULT_HOLIDAY_REGION;
    if (key === CFG_ORG) return this.entryOrg.id;
    if (key === CFG_SCHEME) return JSON.stringify(this.org.scheme);
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
      if (!cellValueEqual(before[k], after[k])) {
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
      .then(() => {
        this.setAuthPaused(false);
        this.setSyncUnavailable(false);
      })
      .catch((err) => {
        // Auth lapsed (e.g. iOS/Safari ITP) → pause and prompt reconnect, keep cached data.
        // Transient network errors leave the state unchanged and retry on the next tick.
        if (err instanceof Error && err.message === AUTH_INTERACTION_REQUIRED) {
          this.setAuthPaused(true);
          this.setSyncUnavailable(false);
        } else {
          this.setSyncUnavailable(true);
        }
      });
    return this.syncChain;
  }
  /** True when sync is paused because the session lapsed and needs interactive re-auth. */
  get needsReconnect(): boolean {
    return this.authPaused;
  }
  get isSyncUnavailable(): boolean {
    return this.syncUnavailable;
  }
  private setAuthPaused(v: boolean): void {
    if (this.authPaused !== v) {
      this.authPaused = v;
      this.emitChange();
    }
  }
  private setSyncUnavailable(value: boolean): void {
    if (this.syncUnavailable !== value) {
      this.syncUnavailable = value;
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
      // The pull succeeded, so the doc now reflects any workplace this account already chose.
      this.seedOrgDefaults();
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
