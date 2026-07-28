import type { CalendarNote, ResolvedDay } from '@badgy/shared';
import { describe, expect, it } from 'vitest';
import { computeAwayBands, seriesPoints, xFraction } from './forecast.js';

type Day = Pick<ResolvedDay, 'date' | 'status' | 'isFuture'>;

const day = (date: string, status: Day['status'], isFuture: boolean): Day => ({
  date,
  status,
  isFuture,
});

const note = (start: string, end: string, label: string): CalendarNote => ({
  id: `${start}-${end}`,
  start,
  end,
  label,
  color: '#7a3f8f',
});

describe('computeAwayBands', () => {
  it('groups contiguous future vacation/holiday days into one band', () => {
    const days: Day[] = [
      day('2026-07-11', 'office', true),
      day('2026-07-12', 'vacation', true),
      day('2026-07-13', 'vacation', true),
      day('2026-07-14', 'holiday', true),
      day('2026-07-15', 'office', true),
    ];
    expect(computeAwayBands(days, [])).toEqual([
      { startDate: '2026-07-12', endDate: '2026-07-14', label: null },
    ]);
  });

  it('ignores past away days even when adjacent to future ones', () => {
    const days: Day[] = [day('2026-07-10', 'vacation', false), day('2026-07-11', 'vacation', true)];
    expect(computeAwayBands(days, [])).toEqual([
      { startDate: '2026-07-11', endDate: '2026-07-11', label: null },
    ]);
  });

  it('labels a band from an overlapping note, ignoring notes that only partially touch it', () => {
    const days: Day[] = [
      day('2026-07-13', 'vacation', true),
      day('2026-07-14', 'vacation', true),
      day('2026-07-15', 'vacation', true),
      day('2026-07-16', 'vacation', true),
      day('2026-07-17', 'vacation', true),
    ];
    const notes = [note('2026-07-13', '2026-07-17', 'Cabin week')];
    expect(computeAwayBands(days, notes)).toEqual([
      { startDate: '2026-07-13', endDate: '2026-07-17', label: 'Cabin week' },
    ]);
  });

  it('leaves a band unlabeled when no note overlaps it', () => {
    const days: Day[] = [day('2026-08-03', 'vacation', true)];
    const notes = [note('2026-01-01', '2026-01-05', 'New Year trip')];
    expect(computeAwayBands(days, notes)[0].label).toBeNull();
  });

  it('splits two vacation runs separated by an office day into two bands', () => {
    const days: Day[] = [
      day('2026-09-01', 'vacation', true),
      day('2026-09-02', 'office', true),
      day('2026-09-03', 'vacation', true),
    ];
    expect(computeAwayBands(days, [])).toEqual([
      { startDate: '2026-09-01', endDate: '2026-09-01', label: null },
      { startDate: '2026-09-03', endDate: '2026-09-03', label: null },
    ]);
  });
});

describe('xFraction', () => {
  it('maps the domain start and end to 0 and 1', () => {
    expect(xFraction('2026-07-01', '2026-07-01', '2026-07-31')).toBe(0);
    expect(xFraction('2026-07-31', '2026-07-01', '2026-07-31')).toBe(1);
  });

  it('clamps dates outside the domain', () => {
    expect(xFraction('2026-06-01', '2026-07-01', '2026-07-31')).toBe(0);
    expect(xFraction('2026-08-15', '2026-07-01', '2026-07-31')).toBe(1);
  });

  it('returns 0 for a zero-width domain instead of dividing by zero', () => {
    expect(xFraction('2026-07-01', '2026-07-01', '2026-07-01')).toBe(0);
  });
});

describe('seriesPoints', () => {
  it('plots each point at its period end, scaled to the given width/height', () => {
    const points = [
      { end: '2026-07-01', score: 1 },
      { end: '2026-07-31', score: 0 },
    ];
    expect(seriesPoints(points, '2026-07-01', '2026-07-31', 100, 50)).toBe('0,0 100,50');
  });

  it('skips points with a null score', () => {
    const points = [
      { end: '2026-07-01', score: null },
      { end: '2026-07-31', score: 0.5 },
    ];
    expect(seriesPoints(points, '2026-07-01', '2026-07-31', 100, 50)).toBe('100,25');
  });

  it('clamps a score above 1 to the top of the plot', () => {
    const points = [{ end: '2026-07-01', score: 1.2 }];
    expect(seriesPoints(points, '2026-07-01', '2026-07-31', 100, 50)).toBe('0,0');
  });
});
