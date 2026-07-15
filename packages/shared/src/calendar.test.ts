import { describe, expect, it } from 'vitest';
import {
  addDays,
  isHolidayDate,
  isMeetupWeek,
  meetupCycleLabel,
  monthGrid,
  shiftMonth,
  weekdayOf,
  weekStartOf,
  weekStartsOfYear,
  yearBounds,
} from './calendar.js';
import { HOLIDAY_DATES } from './holidays.js';

describe('date utils', () => {
  it('weekStartOf returns the Sunday', () => {
    expect(weekStartOf('2026-01-04')).toBe('2026-01-04'); // Sunday
    expect(weekStartOf('2026-01-05')).toBe('2026-01-04'); // Monday
    expect(weekStartOf('2026-01-10')).toBe('2026-01-04'); // Saturday
  });
  it('addDays + weekdayOf', () => {
    expect(addDays('2026-01-05', 4)).toBe('2026-01-09');
    expect(weekdayOf('2026-01-05')).toBe(1); // Monday
    expect(weekdayOf('2026-01-10')).toBe(6); // Saturday
  });
  it('shiftMonth normalizes across years', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 });
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 });
    expect(shiftMonth(2026, 5, 20)).toEqual({ year: 2028, month0: 1 });
    expect(shiftMonth(2026, 5, -20)).toEqual({ year: 2024, month0: 9 });
  });
  it('yearBounds returns the inclusive calendar-year range', () => {
    expect(yearBounds(2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });
  it('weekStartsOfYear(2026) = 52 Sundays, Jan 4 … Dec 27', () => {
    const starts = weekStartsOfYear(2026);
    expect(starts.length).toBe(52);
    expect(starts[0]).toBe('2026-01-04');
    expect(starts.at(-1)).toBe('2026-12-27');
  });
  it('monthGrid covers full leading/trailing weeks', () => {
    const g = monthGrid(2026, 0); // Jan 2026 (Jan 1 = Thu)
    expect(g.weekStarts[0]).toBe('2025-12-28');
    expect(g.weekStarts.length).toBe(5);
  });
  it('recognizes published company holidays', () => {
    expect(HOLIDAY_DATES[2027]).toEqual([
      '2027-01-18',
      '2027-02-15',
      '2027-05-31',
      '2027-07-05',
      '2027-09-06',
      '2027-11-25',
      '2027-11-26',
      '2027-12-23',
      '2027-12-24',
      '2027-12-31',
    ]);
    expect(isHolidayDate('2026-01-19')).toBe(true);
    expect(isHolidayDate('2026-01-20')).toBe(false);
    expect(isHolidayDate('2027-01-01')).toBe(true);
    expect(isHolidayDate('2027-06-18')).toBe(false);
    expect(isHolidayDate('2027-07-04')).toBe(false);
    expect(isHolidayDate('2027-07-05')).toBe(true);
    expect(isHolidayDate('2027-12-23')).toBe(true);
    expect(isHolidayDate('2027-12-24')).toBe(true);
    expect(isHolidayDate('2027-12-25')).toBe(false);
    expect(isHolidayDate('2027-12-27')).toBe(false);
    expect(isHolidayDate('2027-12-31')).toBe(true);
    expect(isHolidayDate('2028-01-01')).toBe(false);
  });
  it('recognizes published meetup weeks', () => {
    expect(isMeetupWeek('2026-03-08')).toBe(true);
    expect(isMeetupWeek('2026-03-15')).toBe(false);
    expect(isMeetupWeek('2026-09-20')).toBe(true);
    expect(isMeetupWeek('2026-10-11')).toBe(false);
    expect(isMeetupWeek('2026-11-15')).toBe(false);
    expect(isMeetupWeek('2027-01-10')).toBe(true);
    expect(isMeetupWeek('2027-04-11')).toBe(false);
  });
  it('labels published meetup cycles without naming custom weeks', () => {
    expect(meetupCycleLabel('2026-01-11')).toBe('26-C1');
    expect(meetupCycleLabel('2026-07-12')).toBe('26-C4');
    expect(meetupCycleLabel('2026-09-20')).toBe('26-C5');
    expect(meetupCycleLabel('2026-10-11')).toBeNull();
    expect(meetupCycleLabel('2027-01-10')).toBe('27-C1');
    expect(meetupCycleLabel('2027-04-11')).toBeNull();
    expect(meetupCycleLabel('2026-08-09')).toBeNull();
  });
});
