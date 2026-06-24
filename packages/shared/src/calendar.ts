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

/** Monday of the ISO week containing `iso`. */
export function weekStartOf(iso: string): string {
  const back = (weekdayOf(iso) + 6) % 7; // days since Monday
  return addDays(iso, -back);
}

/** Mondays for `count` contiguous weeks ending at (and including) `endMonday`. */
export function trailingMondays(endMonday: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(endMonday, -7 * i));
  return out;
}

/** Every Monday that falls within `year`. */
export function mondaysOfYear(year: number): string[] {
  const jan1 = Date.UTC(year, 0, 1);
  const dow = new Date(jan1).getUTCDay();
  const offset = (8 - dow) % 7; // 0 when Jan 1 is a Monday
  let t = jan1 + offset * MS_PER_DAY;
  const out: string[] = [];
  while (new Date(t).getUTCFullYear() === year) {
    out.push(toISO(new Date(t)));
    t += 7 * MS_PER_DAY;
  }
  return out;
}

/** The Mon-anchored week grid covering a month (full leading/trailing weeks). */
export function monthGrid(year: number, month0: number): { first: string; mondays: string[] } {
  const first = toISO(new Date(Date.UTC(year, month0, 1)));
  const lastDay = toISO(new Date(Date.UTC(year, month0 + 1, 0)));
  const start = weekStartOf(first);
  const end = weekStartOf(lastDay);
  const mondays: string[] = [];
  for (let m = start; m <= end; m = addDays(m, 7)) mondays.push(m);
  return { first, mondays };
}

// --- holidays ---
const HOLIDAY_SET = new Set<string>(Object.values(HOLIDAY_DATES).flat());
export function isHolidayDate(iso: string): boolean {
  return HOLIDAY_SET.has(iso);
}

// --- meetup weeks (Monday ISO dates; 2026 from chatgpm/cycles.yaml) ---
export const MEETUP_WEEKS: Record<number, readonly string[]> = {
  2026: ['2026-01-12', '2026-03-09', '2026-05-11', '2026-07-13', '2026-09-21', '2026-11-16'],
};
const MEETUP_SET = new Set<string>(Object.values(MEETUP_WEEKS).flat());
export function isMeetupWeek(weekStartISO: string): boolean {
  return MEETUP_SET.has(weekStartISO);
}
