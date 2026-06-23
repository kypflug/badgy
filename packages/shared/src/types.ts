/** Canonical attendance types — shared by web and server. */

/** Day statuses, from the template's `Values` sheet (order = preferred display order). */
export const STATUSES = [
  'Office',
  'Planned',
  'Remote',
  'DTO',
  'Holiday',
  'Sick',
  'Travel',
] as const;
export type Status = (typeof STATUSES)[number];

/** Statuses that count toward a week's Office Days (both badged + intended). */
export const OFFICE_STATUSES: readonly Status[] = ['Office', 'Planned'];

/** The default day value (matches the template). */
export const DEFAULT_STATUS: Status = 'Planned';

/** Working days tracked per week (Mon–Fri). */
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type WeekDays = Record<DayKey, Status>;

export interface Week {
  /** ISO date (yyyy-mm-dd) of the Monday that starts the week. */
  weekStart: string;
  days: WeekDays;
  /** MAI Meetup week — highlighted in the tracker. */
  meetup: boolean;
}

export interface YearData {
  year: number;
  weeks: Week[];
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}
