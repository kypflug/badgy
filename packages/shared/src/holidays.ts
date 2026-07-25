/**
 * Public-holiday rule engine.
 *
 * Regions are described as *rules* (fixed date, nth/last weekday of a month, Easter offsets,
 * weekend-observance shifts) rather than hardcoded date tables, so any year resolves without
 * yearly maintenance. Users pick a region in Settings and can add, remove or import their own
 * days on top of it — see the `h|` override cells in `sync/doc.ts`.
 */
import { addDays, toISO, weekdayOf } from './calendar.js';
import type { Weekday } from './types.js';

export interface Holiday {
  date: string;
  name: string;
}

export type HolidayRegionId =
  | 'us-microsoft'
  | 'us-federal'
  | 'ca'
  | 'uk'
  | 'ie'
  | 'au'
  | 'de'
  | 'fr'
  | 'in';

export interface HolidayRegion {
  id: HolidayRegionId;
  label: string;
  /** Shown under the region picker to set expectations about coverage. */
  note?: string;
}

/**
 * How a holiday moves when it lands on a weekend.
 * - `none` — stays put (most of continental Europe).
 * - `nearest-weekday` — Saturday → Friday, Sunday → Monday (United States).
 * - `next-weekday` — always forward to the next free weekday (UK/Ireland substitute days).
 */
type Observance = 'none' | 'nearest-weekday' | 'next-weekday';

type Rule =
  | { kind: 'fixed'; month: number; day: number; name: string; observance?: Observance }
  | { kind: 'nth-weekday'; month: number; weekday: Weekday; nth: number; name: string }
  | { kind: 'last-weekday'; month: number; weekday: Weekday; name: string }
  /** Latest `weekday` falling on or before `month`/`day` — e.g. Canada's Victoria Day. */
  | { kind: 'weekday-on-or-before'; month: number; day: number; weekday: Weekday; name: string }
  | { kind: 'easter'; offset: number; name: string }
  /** Anchored to an already-resolved rule's *observed* date — e.g. the day after Thanksgiving. */
  | { kind: 'relative'; to: string; offset: number; name: string }
  | { kind: 'computed'; name: string; resolve: (year: number) => string };

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

/** Date of the `nth` (1-based) `weekday` in a month; `nth` past the end clamps to the last one. */
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
    case 'computed':
      return rule.resolve(year);
  }
}

const NEW_YEAR_US: Rule = {
  kind: 'fixed',
  month: 1,
  day: 1,
  name: "New Year's Day",
  observance: 'nearest-weekday',
};
const MLK: Rule = {
  kind: 'nth-weekday',
  month: 1,
  weekday: 1,
  nth: 3,
  name: 'Martin Luther King Jr. Day',
};
const PRESIDENTS: Rule = {
  kind: 'nth-weekday',
  month: 2,
  weekday: 1,
  nth: 3,
  name: "Presidents' Day",
};
const MEMORIAL: Rule = { kind: 'last-weekday', month: 5, weekday: 1, name: 'Memorial Day' };
const INDEPENDENCE: Rule = {
  kind: 'fixed',
  month: 7,
  day: 4,
  name: 'Independence Day',
  observance: 'nearest-weekday',
};
const LABOR_US: Rule = { kind: 'nth-weekday', month: 9, weekday: 1, nth: 1, name: 'Labor Day' };
const THANKSGIVING: Rule = {
  kind: 'nth-weekday',
  month: 11,
  weekday: 4,
  nth: 4,
  name: 'Thanksgiving Day',
};
const CHRISTMAS_US: Rule = {
  kind: 'fixed',
  month: 12,
  day: 25,
  name: 'Christmas Day',
  observance: 'nearest-weekday',
};

const REGION_RULES: Record<HolidayRegionId, readonly Rule[]> = {
  // Microsoft's observed US holidays: the federal core minus Juneteenth, Columbus Day and
  // Veterans Day, plus the day after Thanksgiving and Christmas Eve. Christmas Eve tracks the
  // *observed* Christmas Day so the pair always stays adjacent.
  'us-microsoft': [
    NEW_YEAR_US,
    MLK,
    PRESIDENTS,
    MEMORIAL,
    INDEPENDENCE,
    LABOR_US,
    THANKSGIVING,
    { kind: 'relative', to: 'Thanksgiving Day', offset: 1, name: 'Day after Thanksgiving' },
    CHRISTMAS_US,
    { kind: 'relative', to: 'Christmas Day', offset: -1, name: 'Christmas Eve' },
  ],
  'us-federal': [
    NEW_YEAR_US,
    MLK,
    PRESIDENTS,
    MEMORIAL,
    { kind: 'fixed', month: 6, day: 19, name: 'Juneteenth', observance: 'nearest-weekday' },
    INDEPENDENCE,
    LABOR_US,
    { kind: 'nth-weekday', month: 10, weekday: 1, nth: 2, name: 'Columbus Day' },
    { kind: 'fixed', month: 11, day: 11, name: 'Veterans Day', observance: 'nearest-weekday' },
    THANKSGIVING,
    CHRISTMAS_US,
  ],
  ca: [
    { kind: 'fixed', month: 1, day: 1, name: "New Year's Day", observance: 'next-weekday' },
    { kind: 'easter', offset: -2, name: 'Good Friday' },
    { kind: 'weekday-on-or-before', month: 5, day: 24, weekday: 1, name: 'Victoria Day' },
    { kind: 'fixed', month: 7, day: 1, name: 'Canada Day', observance: 'next-weekday' },
    { kind: 'nth-weekday', month: 9, weekday: 1, nth: 1, name: 'Labour Day' },
    {
      kind: 'fixed',
      month: 9,
      day: 30,
      name: 'National Day for Truth and Reconciliation',
      observance: 'next-weekday',
    },
    { kind: 'nth-weekday', month: 10, weekday: 1, nth: 2, name: 'Thanksgiving' },
    { kind: 'fixed', month: 11, day: 11, name: 'Remembrance Day', observance: 'next-weekday' },
    { kind: 'fixed', month: 12, day: 25, name: 'Christmas Day', observance: 'next-weekday' },
    { kind: 'fixed', month: 12, day: 26, name: 'Boxing Day', observance: 'next-weekday' },
  ],
  uk: [
    { kind: 'fixed', month: 1, day: 1, name: "New Year's Day", observance: 'next-weekday' },
    { kind: 'easter', offset: -2, name: 'Good Friday' },
    { kind: 'easter', offset: 1, name: 'Easter Monday' },
    { kind: 'nth-weekday', month: 5, weekday: 1, nth: 1, name: 'Early May bank holiday' },
    { kind: 'last-weekday', month: 5, weekday: 1, name: 'Spring bank holiday' },
    { kind: 'last-weekday', month: 8, weekday: 1, name: 'Summer bank holiday' },
    { kind: 'fixed', month: 12, day: 25, name: 'Christmas Day', observance: 'next-weekday' },
    { kind: 'fixed', month: 12, day: 26, name: 'Boxing Day', observance: 'next-weekday' },
  ],
  ie: [
    { kind: 'fixed', month: 1, day: 1, name: "New Year's Day", observance: 'next-weekday' },
    {
      kind: 'computed',
      name: "St Brigid's Day",
      // 1 February when that is a Friday, otherwise the first Monday in February.
      resolve: (year) =>
        weekdayOf(ymd(year, 2, 1)) === 5 ? ymd(year, 2, 1) : nthWeekday(year, 2, 1, 1),
    },
    { kind: 'fixed', month: 3, day: 17, name: "St Patrick's Day", observance: 'next-weekday' },
    { kind: 'easter', offset: 1, name: 'Easter Monday' },
    { kind: 'nth-weekday', month: 5, weekday: 1, nth: 1, name: 'May Day' },
    { kind: 'nth-weekday', month: 6, weekday: 1, nth: 1, name: 'June bank holiday' },
    { kind: 'nth-weekday', month: 8, weekday: 1, nth: 1, name: 'August bank holiday' },
    { kind: 'last-weekday', month: 10, weekday: 1, name: 'October bank holiday' },
    { kind: 'fixed', month: 12, day: 25, name: 'Christmas Day', observance: 'next-weekday' },
    { kind: 'fixed', month: 12, day: 26, name: "St Stephen's Day", observance: 'next-weekday' },
  ],
  au: [
    { kind: 'fixed', month: 1, day: 1, name: "New Year's Day", observance: 'next-weekday' },
    { kind: 'fixed', month: 1, day: 26, name: 'Australia Day', observance: 'next-weekday' },
    { kind: 'easter', offset: -2, name: 'Good Friday' },
    { kind: 'easter', offset: 1, name: 'Easter Monday' },
    { kind: 'fixed', month: 4, day: 25, name: 'Anzac Day' },
    { kind: 'nth-weekday', month: 6, weekday: 1, nth: 2, name: "King's Birthday" },
    { kind: 'fixed', month: 12, day: 25, name: 'Christmas Day', observance: 'next-weekday' },
    { kind: 'fixed', month: 12, day: 26, name: 'Boxing Day', observance: 'next-weekday' },
  ],
  de: [
    { kind: 'fixed', month: 1, day: 1, name: 'Neujahr' },
    { kind: 'easter', offset: -2, name: 'Karfreitag' },
    { kind: 'easter', offset: 1, name: 'Ostermontag' },
    { kind: 'fixed', month: 5, day: 1, name: 'Tag der Arbeit' },
    { kind: 'easter', offset: 39, name: 'Christi Himmelfahrt' },
    { kind: 'easter', offset: 50, name: 'Pfingstmontag' },
    { kind: 'fixed', month: 10, day: 3, name: 'Tag der Deutschen Einheit' },
    { kind: 'fixed', month: 12, day: 25, name: '1. Weihnachtstag' },
    { kind: 'fixed', month: 12, day: 26, name: '2. Weihnachtstag' },
  ],
  fr: [
    { kind: 'fixed', month: 1, day: 1, name: "Jour de l'An" },
    { kind: 'easter', offset: 1, name: 'Lundi de Pâques' },
    { kind: 'fixed', month: 5, day: 1, name: 'Fête du Travail' },
    { kind: 'fixed', month: 5, day: 8, name: 'Victoire 1945' },
    { kind: 'easter', offset: 39, name: 'Ascension' },
    { kind: 'easter', offset: 50, name: 'Lundi de Pentecôte' },
    { kind: 'fixed', month: 7, day: 14, name: 'Fête nationale' },
    { kind: 'fixed', month: 8, day: 15, name: 'Assomption' },
    { kind: 'fixed', month: 11, day: 1, name: 'Toussaint' },
    { kind: 'fixed', month: 11, day: 11, name: 'Armistice 1918' },
    { kind: 'fixed', month: 12, day: 25, name: 'Noël' },
  ],
  in: [
    { kind: 'fixed', month: 1, day: 26, name: 'Republic Day' },
    { kind: 'fixed', month: 8, day: 15, name: 'Independence Day' },
    { kind: 'fixed', month: 10, day: 2, name: 'Gandhi Jayanti' },
  ],
};

export const HOLIDAY_REGIONS: readonly HolidayRegion[] = [
  {
    id: 'us-microsoft',
    label: 'United States — Microsoft',
    note: 'Microsoft’s observed US holidays.',
  },
  { id: 'us-federal', label: 'United States — federal' },
  { id: 'ca', label: 'Canada' },
  { id: 'uk', label: 'United Kingdom' },
  { id: 'ie', label: 'Ireland' },
  { id: 'au', label: 'Australia' },
  { id: 'de', label: 'Germany' },
  { id: 'fr', label: 'France' },
  {
    id: 'in',
    label: 'India',
    note: 'Gazetted national days only — festival dates vary, so import an .ics for the rest.',
  },
];

export const DEFAULT_HOLIDAY_REGION: HolidayRegionId = 'us-microsoft';

export function isHolidayRegionId(value: unknown): value is HolidayRegionId {
  return typeof value === 'string' && value in REGION_RULES;
}

const cache = new Map<string, readonly Holiday[]>();

/** Every holiday the region observes in `year`, sorted by observed date. */
export function holidaysForYear(region: HolidayRegionId, year: number): readonly Holiday[] {
  const key = `${region}|${year}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const taken = new Set<string>();
  const resolved = new Map<string, string>();
  const out: Holiday[] = [];
  for (const rule of REGION_RULES[region]) {
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
 * Holidays *observed on dates inside* `year`. A holiday can shift across a year boundary — a
 * Saturday 1 January is observed on 31 December of the previous year — so the neighbouring
 * years are resolved and filtered too.
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
