/**
 * Sync document — a sparse last-write-wins map of *overrides* keyed per ISO date / setting,
 * each stamped with an HLC. Unset days resolve from defaults: known holidays → holiday,
 * configured "usual week" pattern, unconfigured weekends → untracked, else `office`.
 * `merge` is a commutative + idempotent CRDT.
 */
import { addDays, isMeetupWeek, todayISO, weekdayOf, weekStartOf } from '../calendar.js';
import {
  DEFAULT_HOLIDAY_REGION,
  type HolidayRegionId,
  holidayNameFor,
  isHolidayRegionId,
} from '../holidays.js';
import {
  type CalendarNote,
  isWeekend,
  LEGACY_STATUS_MAP,
  type Status,
  type Weekday,
} from '../types.js';
import { compareStamp, type Stamp } from './hlc.js';

/**
 * Cell payloads by key namespace: `d|` and `pat|` → `Status`, `m|` → boolean,
 * `h|` → boolean or a holiday display name, `n|` → `CalendarNote` (`null` = tombstone),
 * `cfg|targetBelt` → number, `cfg|holidayRegion` → `HolidayRegionId`.
 * The union widens to `string` because holiday names are free-form.
 */
export type CellValue = string | number | boolean | CalendarNote | null;
export interface Cell {
  v: CellValue;
  t: Stamp;
}
export interface Doc {
  v: 1;
  cells: Record<string, Cell>;
}

export function emptyDoc(): Doc {
  return { v: 1, cells: {} };
}

// --- keys ---
export const dateKey = (iso: string): string => `d|${iso}`;
export const patternKey = (weekday: Weekday): string => `pat|${weekday}`;
export const meetupKey = (weekStartISO: string): string => `m|${weekStartISO}`;
export const holidayKey = (iso: string): string => `h|${iso}`;
export const noteKey = (id: string): string => `n|${id}`;
export const CFG_TARGET = 'cfg|targetBelt';
export const CFG_HOLIDAY_REGION = 'cfg|holidayRegion';

function isISODate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isCalendarNote(value: unknown): value is CalendarNote {
  if (typeof value !== 'object' || value === null) return false;
  const note = value as Partial<CalendarNote>;
  return (
    typeof note.id === 'string' &&
    note.id.length > 0 &&
    !note.id.includes('|') &&
    isISODate(note.start) &&
    isISODate(note.end) &&
    note.start <= note.end &&
    typeof note.label === 'string' &&
    note.label.trim().length > 0 &&
    typeof note.color === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(note.color)
  );
}

export function cellValueEqual(a: CellValue | undefined, b: CellValue | undefined): boolean {
  if (a === b) return true;
  if (!isCalendarNote(a) || !isCalendarNote(b)) return false;
  return (
    a.id === b.id &&
    a.start === b.start &&
    a.end === b.end &&
    a.label === b.label &&
    a.color === b.color
  );
}

// --- mutation ---
function tieBreak(v: CellValue): string {
  return JSON.stringify(v);
}
export function setCell(doc: Doc, key: string, value: CellValue, stamp: Stamp): void {
  const cur = doc.cells[key];
  if (!cur || compareStamp(stamp, cur.t) > 0) doc.cells[key] = { v: value, t: stamp };
}
export function merge(a: Doc, b: Doc): Doc {
  const cells: Record<string, Cell> = { ...a.cells };
  for (const key of Object.keys(b.cells)) {
    const cb = b.cells[key];
    const ca = cells[key];
    if (!ca) {
      cells[key] = cb;
      continue;
    }
    const cmp = compareStamp(cb.t, ca.t);
    if (cmp > 0 || (cmp === 0 && tieBreak(cb.v) > tieBreak(ca.v))) cells[key] = cb;
  }
  return { v: 1, cells };
}

// --- reads ---
export function getPattern(doc: Doc): Partial<Record<Weekday, Status>> {
  const pattern: Partial<Record<Weekday, Status>> = {};
  for (const key of Object.keys(doc.cells)) {
    if (key.startsWith('pat|'))
      pattern[Number(key.slice(4)) as Weekday] = doc.cells[key].v as Status;
  }
  return pattern;
}
export function getTarget(doc: Doc): number {
  return (doc.cells[CFG_TARGET]?.v as number | undefined) ?? 0.8;
}
export function isMeetupOverride(doc: Doc, weekStartISO: string): boolean {
  const cell = doc.cells[meetupKey(weekStartISO)];
  return cell ? Boolean(cell.v) : isMeetupWeek(weekStartISO);
}
export function getHolidayRegion(doc: Doc): HolidayRegionId {
  const value = doc.cells[CFG_HOLIDAY_REGION]?.v;
  return isHolidayRegionId(value) ? value : DEFAULT_HOLIDAY_REGION;
}
/** Region default for the date, unless the user has explicitly added or removed it. */
export function isHolidayOverride(doc: Doc, iso: string): boolean {
  const cell = doc.cells[holidayKey(iso)];
  if (cell) return Boolean(cell.v);
  return holidayNameFor(getHolidayRegion(doc), iso) !== null;
}
/** Label for a resolved holiday: the user's own name when set, else the region's. */
export function holidayLabel(doc: Doc, iso: string): string | null {
  const cell = doc.cells[holidayKey(iso)];
  if (cell && !cell.v) return null;
  if (typeof cell?.v === 'string' && cell.v.trim()) return cell.v.trim();
  const regionName = holidayNameFor(getHolidayRegion(doc), iso);
  if (regionName) return regionName;
  return cell?.v ? 'Holiday' : null;
}
export function getNotes(doc: Doc, start?: string, end?: string): CalendarNote[] {
  const notes: CalendarNote[] = [];
  for (const key of Object.keys(doc.cells)) {
    if (!key.startsWith('n|')) continue;
    const value = doc.cells[key].v;
    if (
      isCalendarNote(value) &&
      value.id === key.slice(2) &&
      (start === undefined || value.end >= start) &&
      (end === undefined || value.start <= end)
    )
      notes.push(value);
  }
  return notes.sort(
    (a, b) =>
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end) ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id),
  );
}

// --- resolution ---
export interface ResolvedDay {
  date: string;
  status: Status;
  weekday: Weekday;
  isWeekend: boolean;
  isHoliday: boolean;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  meetupWeek: boolean;
  explicit: boolean;
}

export function resolveDay(
  doc: Doc,
  iso: string,
  pattern: Partial<Record<Weekday, Status>> = getPattern(doc),
  today: string = todayISO(),
): ResolvedDay {
  const weekday = weekdayOf(iso);
  const override = doc.cells[dateKey(iso)]?.v as Status | undefined;
  const holiday = isHolidayOverride(doc, iso);
  let status: Status;
  if (override != null) status = override;
  else if (holiday) status = 'holiday';
  else if (pattern[weekday] != null) status = pattern[weekday];
  else if (isWeekend(weekday)) status = 'none';
  else status = 'office';
  return {
    date: iso,
    status,
    weekday,
    isWeekend: isWeekend(weekday),
    isHoliday: holiday,
    isToday: iso === today,
    isPast: iso < today,
    isFuture: iso > today,
    meetupWeek: isMeetupOverride(doc, weekStartOf(iso)),
    explicit: override != null,
  };
}

export function resolveRange(
  doc: Doc,
  start: string,
  end: string,
  today: string = todayISO(),
): ResolvedDay[] {
  const pattern = getPattern(doc);
  const out: ResolvedDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(resolveDay(doc, d, pattern, today));
  return out;
}

// --- migration from the v1 (weekly-grid) doc format ---
const LEGACY_DAY_OFFSET: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4 };

/** Convert legacy `d|year|weekStart|day` cells → `d|<date>` (+ taxonomy map); drop dropped keys. */
export function migrate(doc: Doc): Doc {
  let changed = false;
  const cells: Record<string, Cell> = { ...doc.cells };
  for (const key of Object.keys(doc.cells)) {
    const parts = key.split('|');
    if (parts[0] === 'd' && parts.length === 4) {
      const [, , weekStart, day] = parts;
      const offset = LEGACY_DAY_OFFSET[day];
      if (offset != null) {
        const iso = addDays(weekStart, offset);
        const raw = doc.cells[key].v;
        const mapped = (typeof raw === 'string' && LEGACY_STATUS_MAP[raw]) || raw;
        cells[dateKey(iso)] = { v: mapped as CellValue, t: doc.cells[key].t };
        delete cells[key];
        changed = true;
      }
    } else if ((parts[0] === 'cfg' && parts[1] === 'activeYear') || parts[0] === 'y') {
      delete cells[key]; // concepts removed in v2
      changed = true;
    } else if (parts[0] === 'm' && parts.length === 2 && weekdayOf(parts[1]) === 1) {
      const sundayKey = meetupKey(addDays(parts[1], -1));
      const oldCell = doc.cells[key];
      const sundayCell = cells[sundayKey];
      if (
        !sundayCell ||
        compareStamp(oldCell.t, sundayCell.t) > 0 ||
        (compareStamp(oldCell.t, sundayCell.t) === 0 &&
          tieBreak(oldCell.v) > tieBreak(sundayCell.v))
      )
        cells[sundayKey] = oldCell;
      delete cells[key];
      changed = true;
    }
  }
  return changed ? { v: 1, cells } : doc;
}
