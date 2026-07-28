import type { CalendarNote } from '@badgy/shared';
import { describe, expect, it } from 'vitest';
import { layoutWeekAnnotations, meetupAnnotation, noteAnnotation } from './annotation-layout.js';

const note = (id: string, start: string, end: string, color: string, label = id): CalendarNote => ({
  id,
  start,
  end,
  color,
  label,
});

describe('layoutWeekAnnotations', () => {
  it('clips inclusive ranges into each visible Sunday-start row', () => {
    const annotation = noteAnnotation(
      note('trip', '2026-07-16', '2026-07-22', '#123456', 'Cross-week'),
    );

    expect(layoutWeekAnnotations('2026-07-12', [annotation])).toMatchObject([
      { start: '2026-07-16', end: '2026-07-18', startColumn: 4, endColumn: 6 },
    ]);
    expect(layoutWeekAnnotations('2026-07-19', [annotation])).toMatchObject([
      { start: '2026-07-19', end: '2026-07-22', startColumn: 0, endColumn: 3 },
    ]);
  });

  it('clips cross-month ranges to dates visible in a compact month', () => {
    const annotation = noteAnnotation(note('month', '2026-06-29', '2026-07-03', '#abcdef'));
    expect(
      layoutWeekAnnotations('2026-06-28', [annotation], '2026-07-01', '2026-07-31'),
    ).toMatchObject([{ start: '2026-07-01', end: '2026-07-03', startColumn: 3, endColumn: 5 }]);
  });

  it('partitions meetup and note collisions and retains every deterministic label and color', () => {
    const inputs = [
      noteAnnotation(note('z', '2026-07-14', '2026-07-17', '#ff0000', 'Zebra')),
      meetupAnnotation('2026-07-12', '26-C4'),
      noteAnnotation(note('a', '2026-07-15', '2026-07-16', '#00ff00', 'Alpha')),
    ];
    const segments = layoutWeekAnnotations('2026-07-12', inputs);

    expect(segments.map(({ start, end, collision }) => ({ start, end, collision }))).toEqual([
      { start: '2026-07-12', end: '2026-07-13', collision: false },
      { start: '2026-07-14', end: '2026-07-14', collision: true },
      { start: '2026-07-15', end: '2026-07-16', collision: true },
      { start: '2026-07-17', end: '2026-07-17', collision: true },
      { start: '2026-07-18', end: '2026-07-18', collision: false },
    ]);
    expect(segments[2].annotations.map((item) => item.label)).toEqual(['26-C4', 'Zebra', 'Alpha']);
    expect(segments[2].colors).toEqual(['var(--badgy-meetup)', '#ff0000', '#00ff00']);
  });
});
