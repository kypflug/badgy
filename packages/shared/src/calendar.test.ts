import { describe, expect, it } from 'vitest';
import {
  addDays,
  isHolidayDate,
  isMeetupWeek,
  mondaysOfYear,
  monthGrid,
  weekdayOf,
  weekStartOf,
} from './calendar.js';

describe('date utils', () => {
  it('weekStartOf returns the Monday', () => {
    expect(weekStartOf('2026-01-05')).toBe('2026-01-05'); // Monday
    expect(weekStartOf('2026-01-11')).toBe('2026-01-05'); // Sunday → prev Monday
  });
  it('addDays + weekdayOf', () => {
    expect(addDays('2026-01-05', 4)).toBe('2026-01-09');
    expect(weekdayOf('2026-01-05')).toBe(1); // Monday
    expect(weekdayOf('2026-01-10')).toBe(6); // Saturday
  });
  it('mondaysOfYear(2026) = 52 weeks, Jan 5 … Dec 28', () => {
    const m = mondaysOfYear(2026);
    expect(m.length).toBe(52);
    expect(m[0]).toBe('2026-01-05');
    expect(m.at(-1)).toBe('2026-12-28');
  });
  it('monthGrid covers full leading/trailing weeks', () => {
    const g = monthGrid(2026, 0); // Jan 2026 (Jan 1 = Thu)
    expect(g.mondays[0]).toBe('2025-12-29');
    expect(g.mondays.length).toBe(5);
  });
  it('holidays + meetup weeks', () => {
    expect(isHolidayDate('2026-01-19')).toBe(true);
    expect(isHolidayDate('2026-01-20')).toBe(false);
    expect(isMeetupWeek('2026-03-09')).toBe(true);
    expect(isMeetupWeek('2026-03-16')).toBe(false);
  });
});
