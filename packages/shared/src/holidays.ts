/** Public-holiday rule engine backed by generated JSON data. */
import { addDays, toISO, weekdayOf } from './calendar.js';
import { HOLIDAY_SETS } from './generated/data.js';
import type { Weekday } from './types.js';

export interface Holiday {
  date: string;
  name: string;
}

export type HolidayRegionId = string;

export interface HolidayRegion {
  id: HolidayRegionId;
  label: string;
  note?: string;
}

export type Observance = 'none' | 'nearest-weekday' | 'next-weekday';

export type Rule =
  | { kind: 'fixed'; month: number; day: number; name: string; observance?: Observance }
  | { kind: 'nth-weekday'; month: number; weekday: Weekday; nth: number; name: string }
  | { kind: 'last-weekday'; month: number; weekday: Weekday; name: string }
  | { kind: 'weekday-on-or-before'; month: number; day: number; weekday: Weekday; name: string }
  | { kind: 'easter'; offset: number; name: string }
  | { kind: 'relative'; to: string; offset: number; name: string }
  | {
      kind: 'fixed-or-nth-weekday';
      month: number;
      day: number;
      onWeekday: Weekday;
      weekday: Weekday;
      nth: number;
      name: string;
    };

export interface HolidaySet extends HolidayRegion {
  rules: readonly Rule[];
}

const HOLIDAY_DATA: readonly HolidaySet[] = HOLIDAY_SETS;

const ymd = (year: number, month: number, day: number): string =>
  toISO(new Date(Date.UTC(year, month - 1, day)));

/** Anonymous Gregorian computus — the ISO date of Easter Sunday. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

function nthWeekday(year: number, month: number, weekday: Weekday, nth: number): string {
  const first = ymd(year, month, 1);
  const offset = (weekday - weekdayOf(first) + 7) % 7;
  const candidate = addDays(first, offset + (nth - 1) * 7);
  return candidate.slice(0, 7) === first.slice(0, 7) ? candidate : addDays(candidate, -7);
}

function lastWeekday(year: number, month: number, weekday: Weekday): string {
  const last = toISO(new Date(Date.UTC(year, month, 0)));
  return addDays(last, -((weekdayOf(last) - weekday + 7) % 7));
}

function weekdayOnOrBefore(year: number, month: number, day: number, weekday: Weekday): string {
  const anchor = ymd(year, month, day);
  return addDays(anchor, -((weekdayOf(anchor) - weekday + 7) % 7));
}

function shiftForObservance(iso: string, observance: Observance, taken: Set<string>): string {
  if (observance === 'none') return iso;
  const weekday = weekdayOf(iso);
  if (observance === 'nearest-weekday') {
    if (weekday === 6) return addDays(iso, -1);
    if (weekday === 0) return addDays(iso, 1);
    return iso;
  }
  let candidate = iso;
  while (weekdayOf(candidate) === 0 || weekdayOf(candidate) === 6 || taken.has(candidate))
    candidate = addDays(candidate, 1);
  return candidate;
}

function resolveRule(rule: Rule, year: number, resolved: Map<string, string>): string {
  switch (rule.kind) {
    case 'fixed':
      return ymd(year, rule.month, rule.day);
    case 'nth-weekday':
      return nthWeekday(year, rule.month, rule.weekday, rule.nth);
    case 'last-weekday':
      return lastWeekday(year, rule.month, rule.weekday);
    case 'weekday-on-or-before':
      return weekdayOnOrBefore(year, rule.month, rule.day, rule.weekday);
    case 'easter':
      return addDays(easterSunday(year), rule.offset);
    case 'relative': {
      const anchor = resolved.get(rule.to);
      if (!anchor)
        throw new Error(`Holiday rule "${rule.name}" references unresolved "${rule.to}"`);
      return addDays(anchor, rule.offset);
    }
    case 'fixed-or-nth-weekday': {
      const fixed = ymd(year, rule.month, rule.day);
      return weekdayOf(fixed) === rule.onWeekday
        ? fixed
        : nthWeekday(year, rule.month, rule.weekday, rule.nth);
    }
  }
}

const REGION_RULES = new Map(HOLIDAY_DATA.map((set) => [set.id, set.rules]));

export const HOLIDAY_REGIONS: readonly HolidayRegion[] = HOLIDAY_DATA.map(({ id, label, note }) =>
  note ? { id, label, note } : { id, label },
);

export const DEFAULT_HOLIDAY_REGION: HolidayRegionId = 'us-microsoft';

export function isHolidayRegionId(value: unknown): value is HolidayRegionId {
  return typeof value === 'string' && REGION_RULES.has(value);
}

const cache = new Map<string, readonly Holiday[]>();

/** Every holiday the region observes in `year`, sorted by observed date. */
export function holidaysForYear(region: HolidayRegionId, year: number): readonly Holiday[] {
  const key = `${region}|${year}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rules = REGION_RULES.get(region);
  if (!rules) return [];

  const taken = new Set<string>();
  const resolved = new Map<string, string>();
  const out: Holiday[] = [];
  for (const rule of rules) {
    const observance = rule.kind === 'fixed' ? (rule.observance ?? 'none') : 'none';
    const date = shiftForObservance(resolveRule(rule, year, resolved), observance, taken);
    resolved.set(rule.name, date);
    if (taken.has(date)) continue;
    taken.add(date);
    out.push({ date, name: rule.name });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const frozen = Object.freeze(out);
  cache.set(key, frozen);
  return frozen;
}

/**
 * Holidays observed on dates inside `year`, including shifts from neighbouring calendar years.
 */
export function holidaysInYear(region: HolidayRegionId, year: number): readonly Holiday[] {
  const prefix = `${String(year).padStart(4, '0')}-`;
  return [
    ...holidaysForYear(region, year - 1),
    ...holidaysForYear(region, year),
    ...holidaysForYear(region, year + 1),
  ]
    .filter((h) => h.date.startsWith(prefix))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The region's name for `iso`, or `null` when the region does not observe that date. */
export function holidayNameFor(region: HolidayRegionId, iso: string): string | null {
  const year = Number(iso.slice(0, 4));
  for (const offset of [0, -1, 1]) {
    const match = holidaysForYear(region, year + offset).find((h) => h.date === iso);
    if (match) return match.name;
  }
  return null;
}

export function isRegionHoliday(region: HolidayRegionId, iso: string): boolean {
  return holidayNameFor(region, iso) !== null;
}
