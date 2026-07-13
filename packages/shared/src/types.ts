/** Canonical attendance types — shared by the calendar UI and the sync layer. */

/** User-pickable day statuses (ordered for UI). Only `office` counts toward BELT. */
export const STATUSES = [
  'office',
  'remote',
  'travel',
  'vacation',
  'sick',
  'holiday',
  'oof',
] as const;
export type PickableStatus = (typeof STATUSES)[number];

/** Resolved status of a day: a pickable status, or `none` (untracked). */
export type Status = PickableStatus | 'none';

export const STATUS_LABEL: Record<Status, string> = {
  office: 'In office',
  remote: 'Remote',
  travel: 'Business Travel',
  vacation: 'Time off',
  sick: 'Sick',
  holiday: 'Holiday',
  oof: 'Other',
  none: 'Untracked',
};

/** Compact label for dense calendar cells. */
export const STATUS_SHORT: Record<Status, string> = {
  office: 'Office',
  remote: 'Remote',
  travel: 'Travel',
  vacation: 'Off',
  sick: 'Sick',
  holiday: 'Holiday',
  oof: 'Other',
  none: '',
};

export type StatusCounts = Record<PickableStatus, number>;

/** Count resolved editable statuses, omitting `none`. */
export function countStatuses(days: readonly { status: Status }[]): StatusCounts {
  const counts: StatusCounts = {
    office: 0,
    remote: 0,
    travel: 0,
    vacation: 0,
    sick: 0,
    holiday: 0,
    oof: 0,
  };
  for (const day of days) {
    if (day.status !== 'none') counts[day.status]++;
  }
  return counts;
}

/** The only status that counts toward office attendance (BELT). */
export const OFFICE_STATUS: Status = 'office';

export function countsAsOffice(status: Status): boolean {
  return status === 'office';
}

export function isStatus(value: unknown): value is Status {
  return (
    value === 'none' ||
    (typeof value === 'string' && (STATUSES as readonly string[]).includes(value))
  );
}

/** Weekday index per JS `Date.getUTCDay()`: 0=Sun … 6=Sat. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Sunday–Saturday, for the "usual week" pattern editor. */
export const WEEK_DAYS: { idx: Weekday; label: string; short: string }[] = [
  { idx: 0, label: 'Sunday', short: 'Sun' },
  { idx: 1, label: 'Monday', short: 'Mon' },
  { idx: 2, label: 'Tuesday', short: 'Tue' },
  { idx: 3, label: 'Wednesday', short: 'Wed' },
  { idx: 4, label: 'Thursday', short: 'Thu' },
  { idx: 5, label: 'Friday', short: 'Fri' },
  { idx: 6, label: 'Saturday', short: 'Sat' },
];

export function isWeekend(weekday: Weekday): boolean {
  return weekday === 0 || weekday === 6;
}

/** Map the source spreadsheet's statuses onto the v2 taxonomy (import + legacy migration). */
export const EXCEL_STATUS_MAP: Record<string, PickableStatus> = {
  Office: 'office',
  Planned: 'office',
  Remote: 'remote',
  DTO: 'vacation',
  Holiday: 'holiday',
  Sick: 'sick',
  Travel: 'travel',
};
