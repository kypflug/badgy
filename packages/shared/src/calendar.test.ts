import { describe, expect, it } from 'vitest';
import { blankYear, MEETUP_WEEKS, mondaysOfYear } from './calendar.js';
import { SEED_2026 } from './seed/2026.js';

describe('mondaysOfYear', () => {
  it('enumerates every Monday in 2026 (Jan 5 … Dec 28, 52 weeks)', () => {
    const m = mondaysOfYear(2026);
    expect(m.length).toBe(52);
    expect(m[0]).toBe('2026-01-05');
    expect(m.at(-1)).toBe('2026-12-28');
  });

  it('handles a year that starts on a Monday', () => {
    // 2024-01-01 is a Monday.
    expect(mondaysOfYear(2024)[0]).toBe('2024-01-01');
  });
});

describe('blankYear', () => {
  it('defaults all weekdays to Planned and flags meetup weeks', () => {
    const y = blankYear(2026);
    expect(y.weeks.length).toBe(52);
    expect(y.weeks.every((w) => Object.values(w.days).every((s) => s === 'Planned'))).toBe(true);
    expect(y.weeks.filter((w) => w.meetup).map((w) => w.weekStart)).toEqual([
      ...MEETUP_WEEKS[2026],
    ]);
  });
});

describe('SEED_2026', () => {
  it('has 52 weeks and the 6 meetup weeks from the registry', () => {
    expect(SEED_2026.weeks.length).toBe(52);
    expect(SEED_2026.weeks.filter((w) => w.meetup).map((w) => w.weekStart)).toEqual([
      ...MEETUP_WEEKS[2026],
    ]);
  });
});
