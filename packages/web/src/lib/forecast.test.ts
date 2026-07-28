import type { CalendarNote, ResolvedDay } from '@badgy/shared';
import { describe, expect, it } from 'vitest';
import {
  computeAwayBands,
  computeForecastAnnotations,
  layoutForecastAnnotations,
  seriesPoints,
  xFraction,
} from './forecast.js';

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

const annotation = (startDate: string, endDate: string, label: string) => ({
  id: `${startDate}-${endDate}`,
  startDate,
  endDate,
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
    expect(computeAwayBands(days)).toEqual([{ startDate: '2026-07-12', endDate: '2026-07-14' }]);
  });

  it('ignores past away days even when adjacent to future ones', () => {
    const days: Day[] = [day('2026-07-10', 'vacation', false), day('2026-07-11', 'vacation', true)];
    expect(computeAwayBands(days)).toEqual([{ startDate: '2026-07-11', endDate: '2026-07-11' }]);
  });

  it('splits two vacation runs separated by an office day into two bands', () => {
    const days: Day[] = [
      day('2026-09-01', 'vacation', true),
      day('2026-09-02', 'office', true),
      day('2026-09-03', 'vacation', true),
    ];
    expect(computeAwayBands(days)).toEqual([
      { startDate: '2026-09-01', endDate: '2026-09-01' },
      { startDate: '2026-09-03', endDate: '2026-09-03' },
    ]);
  });

  it('bridges untracked days between away days into one continuous band', () => {
    const days: Day[] = [
      day('2026-09-04', 'vacation', true),
      day('2026-09-05', 'none', true),
      day('2026-09-06', 'none', true),
      day('2026-09-07', 'vacation', true),
    ];

    expect(computeAwayBands(days)).toEqual([{ startDate: '2026-09-04', endDate: '2026-09-07' }]);
  });
});

describe('computeForecastAnnotations', () => {
  it('includes every risk-relevant note overlapping the forecast domain exactly once', () => {
    const notes = [
      note('2026-07-13', '2026-07-17', 'Cabin week'),
      note('2026-07-15', '2026-07-16', 'Conference'),
    ];
    const days = [day('2026-07-13', 'vacation', true), day('2026-07-15', 'remote', true)];

    expect(computeForecastAnnotations(notes, days, '2026-07-01', '2026-07-31')).toEqual([
      {
        id: '2026-07-13-2026-07-17',
        startDate: '2026-07-13',
        endDate: '2026-07-17',
        label: 'Cabin week',
        color: '#7a3f8f',
      },
      {
        id: '2026-07-15-2026-07-16',
        startDate: '2026-07-15',
        endDate: '2026-07-16',
        label: 'Conference',
        color: '#7a3f8f',
      },
    ]);
  });

  it('clips cross-domain notes and excludes notes outside the visible range', () => {
    const notes = [
      note('2026-06-28', '2026-07-03', 'Starts early'),
      note('2026-07-29', '2026-08-04', 'Ends late'),
      note('2026-08-10', '2026-08-12', 'Not visible'),
    ];
    const days = [day('2026-07-01', 'sick', true), day('2026-07-31', 'holiday', true)];

    expect(computeForecastAnnotations(notes, days, '2026-07-01', '2026-07-31')).toEqual([
      {
        id: '2026-06-28-2026-07-03',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
        label: 'Starts early',
        color: '#7a3f8f',
      },
      {
        id: '2026-07-29-2026-08-04',
        startDate: '2026-07-29',
        endDate: '2026-07-31',
        label: 'Ends late',
        color: '#7a3f8f',
      },
    ]);
  });

  it('excludes notes that contain only office or untracked days', () => {
    const notes = [
      note('2026-07-01', '2026-07-03', 'Office plan'),
      note('2026-07-04', '2026-07-05', 'Weekend'),
      note('2026-07-06', '2026-07-07', 'Remote plan'),
    ];
    const days = [
      day('2026-07-01', 'office', true),
      day('2026-07-02', 'office', true),
      day('2026-07-03', 'office', true),
      day('2026-07-04', 'none', true),
      day('2026-07-05', 'none', true),
      day('2026-07-06', 'remote', true),
      day('2026-07-07', 'office', true),
    ];

    expect(
      computeForecastAnnotations(notes, days, '2026-07-01', '2026-07-31').map(({ label }) => label),
    ).toEqual(['Remote plan']);
  });

  it('does not repeat a note that crosses separate away runs', () => {
    const annotations = computeForecastAnnotations(
      [note('2026-09-01', '2026-09-03', 'Turkey')],
      [
        day('2026-09-01', 'vacation', true),
        day('2026-09-02', 'none', true),
        day('2026-09-03', 'vacation', true),
      ],
      '2026-09-01',
      '2026-09-30',
    );

    expect(annotations.map(({ label }) => label)).toEqual(['Turkey']);
  });
});

describe('layoutForecastAnnotations', () => {
  it('keeps separated labels on the same lane', () => {
    const annotations = [
      annotation('2026-07-01', '2026-07-02', 'Start'),
      annotation('2026-07-28', '2026-07-29', 'End'),
    ];

    expect(
      layoutForecastAnnotations(annotations, '2026-07-01', '2026-07-31', 236).map(
        ({ lane }) => lane,
      ),
    ).toEqual([0, 0]);
  });

  it('stacks nearby labels into separate lanes', () => {
    const annotations = [
      annotation('2026-07-19', '2026-07-25', 'Row A'),
      annotation('2026-07-26', '2026-07-28', 'Left'),
      annotation('2026-07-29', '2026-08-01', 'Right'),
    ];

    expect(
      layoutForecastAnnotations(annotations, '2026-07-01', '2026-10-18', 236).map(
        ({ lane }) => lane,
      ),
    ).toEqual([0, 1, 2]);
  });

  it('clamps labels within the chart width', () => {
    const annotations = [
      annotation('2026-07-01', '2026-07-01', 'Long label at the start'),
      annotation('2026-07-31', '2026-07-31', 'Long label at the end'),
    ];
    const layouts = layoutForecastAnnotations(annotations, '2026-07-01', '2026-07-31', 236);

    expect(layouts[0].labelX).toBeGreaterThan(0);
    expect(layouts[1].labelX).toBeLessThan(236);
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
