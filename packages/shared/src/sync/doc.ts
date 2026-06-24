/**
 * Sync document — a sparse last-write-wins map of *overrides* keyed per ISO date / setting,
 * each stamped with an HLC. Unset days resolve from defaults: weekends → untracked, known
 * holidays → holiday, else the user's "usual week" pattern (or `office`). `merge` is a
 * commutative + idempotent CRDT.
 */
import {
  addDays,
  isHolidayDate,
  isMeetupWeek,
  todayISO,
  weekdayOf,
  weekStartOf,
} from '../calendar.js';
import { EXCEL_STATUS_MAP, isWeekend, type Status, type Weekday } from '../types.js';
import { compareStamp, type Stamp } from './hlc.js';

export type CellValue = Status | number | boolean;
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
export const CFG_TARGET = 'cfg|targetBelt';

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
  const holiday = isHolidayDate(iso);
  let status: Status;
  if (override != null) status = override;
  else if (isWeekend(weekday)) status = 'none';
  else if (holiday) status = 'holiday';
  else status = pattern[weekday] ?? 'office';
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
        const mapped = (typeof raw === 'string' && EXCEL_STATUS_MAP[raw]) || raw;
        cells[dateKey(iso)] = { v: mapped as CellValue, t: doc.cells[key].t };
        delete cells[key];
        changed = true;
      }
    } else if ((parts[0] === 'cfg' && parts[1] === 'activeYear') || parts[0] === 'y') {
      delete cells[key]; // concepts removed in v2
      changed = true;
    }
  }
  return changed ? { v: 1, cells } : doc;
}
