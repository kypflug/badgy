import { type ResolvedDay, STATUS_LABEL } from '@badgy/shared';

export const YEAR_MONTHS = [
  { long: 'January', short: 'Jan' },
  { long: 'February', short: 'Feb' },
  { long: 'March', short: 'Mar' },
  { long: 'April', short: 'Apr' },
  { long: 'May', short: 'May' },
  { long: 'June', short: 'Jun' },
  { long: 'July', short: 'Jul' },
  { long: 'August', short: 'Aug' },
  { long: 'September', short: 'Sep' },
  { long: 'October', short: 'Oct' },
  { long: 'November', short: 'Nov' },
  { long: 'December', short: 'Dec' },
] as const;

export type YearDayState = 'planned' | 'recorded';

export function yearDayState(day: Pick<ResolvedDay, 'isFuture'>): YearDayState {
  return day.isFuture ? 'planned' : 'recorded';
}

export function yearDayLabel(
  day: Pick<ResolvedDay, 'date' | 'status' | 'isFuture' | 'isHoliday' | 'isToday'>,
  holidayName: string | null,
): string {
  const [year, month, date] = day.date.split('-').map(Number);
  const parts = [
    `${YEAR_MONTHS[month - 1]?.long ?? month} ${date}, ${year}`,
    STATUS_LABEL[day.status],
  ];
  if (day.isHoliday && holidayName && holidayName !== STATUS_LABEL[day.status])
    parts.push(holidayName);
  else if (day.isHoliday && day.status !== 'holiday') parts.push('Holiday');
  if (day.isToday) parts.push('Today');
  parts.push(day.isFuture ? 'Planned' : 'Recorded');
  return parts.join(' · ');
}

export function yearMonthMetadata(days: readonly Pick<ResolvedDay, 'status'>[]): string {
  let office = 0;
  let away = 0;
  for (const day of days) {
    if (day.status === 'office') office++;
    if (day.status === 'vacation' || day.status === 'holiday') away++;
  }
  return away > 0 ? `${away} away` : `${office} in`;
}
