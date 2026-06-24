/**
 * Sync document — a sparse last-write-wins map of *overrides* keyed per cell/setting,
 * each stamped with an HLC. Unset keys fall back to deterministic defaults (the 2026
 * template, the meetup registry, and `Planned`), so a brand-new user's doc is ~empty
 * and grows only with their edits. `merge` is commutative + idempotent (a CRDT); two
 * devices that exchange docs converge regardless of order.
 */
import { MEETUP_WEEKS, mondaysOfYear } from '../calendar.js';
import type { AppData } from '../contract.js';
import { SEED_2026 } from '../seed/2026.js';
import {
  DAY_KEYS,
  type DayKey,
  type Status,
  type Week,
  type WeekDays,
  type YearData,
} from '../types.js';
import { compareStamp, type Stamp } from './hlc.js';

export type CellValue = Status | boolean | number;
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

// --- key builders ---------------------------------------------------------
export const dayKey = (year: number, weekStart: string, day: DayKey): string =>
  `d|${year}|${weekStart}|${day}`;
export const meetupKey = (year: number, weekStart: string): string => `m|${year}|${weekStart}`;
export const yearKey = (year: number): string => `y|${year}`;
export const CFG_TARGET = 'cfg|targetBelt';
export const CFG_ACTIVE = 'cfg|activeYear';

// --- defaults (used when a key has no override) ---------------------------
const SEED_DAYS = new Map<string, WeekDays>(SEED_2026.weeks.map((w) => [w.weekStart, w.days]));

export function defaultStatus(year: number, weekStart: string, day: DayKey): Status {
  if (year === 2026) {
    const days = SEED_DAYS.get(weekStart);
    if (days) return days[day];
  }
  return 'Planned';
}

export function defaultMeetup(year: number, weekStart: string): boolean {
  return (MEETUP_WEEKS[year] ?? []).includes(weekStart);
}

// --- mutation -------------------------------------------------------------
function tieBreak(v: CellValue): string {
  return JSON.stringify(v);
}

/** Apply a stamped write, keeping it only if it wins LWW against the current cell. */
export function setCell(doc: Doc, key: string, value: CellValue, stamp: Stamp): void {
  const cur = doc.cells[key];
  if (!cur || compareStamp(stamp, cur.t) > 0) {
    doc.cells[key] = { v: value, t: stamp };
  }
}

/** Merge two docs into a new one (per-key LWW; deterministic tiebreak on equal stamps). */
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
    if (cmp > 0 || (cmp === 0 && tieBreak(cb.v) > tieBreak(ca.v))) {
      cells[key] = cb;
    }
  }
  return { v: 1, cells };
}

// --- view materialization -------------------------------------------------
export function presentYears(doc: Doc, currentYear: number): number[] {
  const years = new Set<number>([2026, currentYear]);
  for (const key of Object.keys(doc.cells)) {
    if (key.startsWith('y|')) years.add(Number(key.slice(2)));
    else if (key.startsWith('d|') || key.startsWith('m|')) years.add(Number(key.split('|')[1]));
  }
  return [...years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
}

/** Project the sparse doc into the full AppData view model (calendar + defaults + overrides). */
export function materialize(doc: Doc, currentYear: number = new Date().getUTCFullYear()): AppData {
  const get = (key: string): CellValue | undefined => doc.cells[key]?.v;
  const years: Record<number, YearData> = {};

  for (const year of presentYears(doc, currentYear)) {
    const weeks: Week[] = mondaysOfYear(year).map((weekStart) => {
      const days = {} as WeekDays;
      for (const day of DAY_KEYS) {
        days[day] =
          (get(dayKey(year, weekStart, day)) as Status) ?? defaultStatus(year, weekStart, day);
      }
      const meetup = (get(meetupKey(year, weekStart)) as boolean) ?? defaultMeetup(year, weekStart);
      return { weekStart, days, meetup };
    });
    years[year] = { year, weeks };
  }

  const activeRaw = get(CFG_ACTIVE) as number | undefined;
  const activeYear =
    activeRaw != null && years[activeRaw] ? activeRaw : years[currentYear] ? currentYear : 2026;
  const targetBelt = (get(CFG_TARGET) as number | undefined) ?? 0.8;

  return { years, settings: { activeYear, targetBelt } };
}
