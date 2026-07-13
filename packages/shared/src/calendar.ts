/** Date + calendar helpers (UTC / ISO) and the meetup-week registry. */
import { HOLIDAY_DATES } from './holidays.js';
import type { Weekday } from './types.js';

const MS_PER_DAY = 86_400_000;

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}
export function addDays(iso: string, n: number): string {
  return toISO(new Date(parseISO(iso).getTime() + n * MS_PER_DAY));
}
export function weekdayOf(iso: string): Weekday {
  return parseISO(iso).getUTCDay() as Weekday;
}
export function todayISO(): string {
  const n = new Date();
  return toISO(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
}

export interface MonthRef {
  year: number;
  month0: number;
}

/** Inclusive ISO bounds for a calendar year. */
export function yearBounds(year: number): { start: string; end: string } {
  const y = String(year).padStart(4, '0');
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

/** Shift a zero-based calendar month by `delta`, normalizing across year boundaries. */
export function shiftMonth(year: number, month0: number, delta: number): MonthRef {
  const absoluteMonth = year * 12 + month0 + delta;
  const nextYear = Math.floor(absoluteMonth / 12);
  return { year: nextYear, month0: absoluteMonth - nextYear * 12 };
}

/** Sunday of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  return addDays(iso, -weekdayOf(iso));
}

/** Sunday starts for `count` contiguous weeks ending at (and including) `endWeekStart`. */
export function trailingWeekStarts(endWeekStart: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(endWeekStart, -7 * i));
  return out;
}

/** Every Sunday week start that falls within `year`. */
export function weekStartsOfYear(year: number): string[] {
  const jan1 = Date.UTC(year, 0, 1);
  const dow = new Date(jan1).getUTCDay();
  const offset = (7 - dow) % 7; // 0 when Jan 1 is a Sunday
  let t = jan1 + offset * MS_PER_DAY;
  const out: string[] = [];
  while (new Date(t).getUTCFullYear() === year) {
    out.push(toISO(new Date(t)));
    t += 7 * MS_PER_DAY;
  }
  return out;
}

/** The Sunday-anchored week grid covering a month (full leading/trailing weeks). */
export function monthGrid(year: number, month0: number): { first: string; weekStarts: string[] } {
  const first = toISO(new Date(Date.UTC(year, month0, 1)));
  const lastDay = toISO(new Date(Date.UTC(year, month0 + 1, 0)));
  const start = weekStartOf(first);
  const end = weekStartOf(lastDay);
  const weekStarts: string[] = [];
  for (let weekStart = start; weekStart <= end; weekStart = addDays(weekStart, 7))
    weekStarts.push(weekStart);
  return { first, weekStarts };
}

// --- holidays ---
const HOLIDAY_SET = new Set<string>(Object.values(HOLIDAY_DATES).flat());
export function isHolidayDate(iso: string): boolean {
  return HOLIDAY_SET.has(iso);
}

// --- meetup weeks (Sunday ISO dates; published Edge Cycle planning cadence) ---
export const MEETUP_WEEKS: Record<number, readonly string[]> = {
  2026: ['2026-01-11', '2026-03-08', '2026-05-10', '2026-07-12', '2026-10-11'],
  2027: ['2027-01-10', '2027-04-11'],
};
const MEETUP_SET = new Set<string>(Object.values(MEETUP_WEEKS).flat());
export function isMeetupWeek(weekStartISO: string): boolean {
  return MEETUP_SET.has(weekStartISO);
}
