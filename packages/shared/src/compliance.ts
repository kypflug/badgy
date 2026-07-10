/** Per-date → BELT: weekly office days, rolling score, and actual-vs-projected compliance. */
import { BELT_DIVISOR, BELT_WINDOW, type BeltBand, beltBand, beltOf } from './belt.js';
import { addDays, trailingWeekStarts, weekStartOf } from './calendar.js';
import { type Doc, resolveRange } from './sync/doc.js';
import { countsAsOffice } from './types.js';

/** Office days for each Sunday-start week, capped at the five-day BELT divisor. */
export function officeDaysByWeek(
  doc: Doc,
  weekStarts: readonly string[],
  today?: string,
): number[] {
  return weekStarts.map((weekStart) => {
    const week = resolveRange(doc, weekStart, addDays(weekStart, 6), today);
    let n = 0;
    for (const d of week) if (countsAsOffice(d.status)) n++;
    return Math.min(n, BELT_DIVISOR);
  });
}

/** BELT for a target week = best-8 of the trailing 12 weeks' office days, ÷5. */
export function beltForWeek(doc: Doc, targetWeekStart: string, today?: string): number | null {
  return beltOf(officeDaysByWeek(doc, trailingWeekStarts(targetWeekStart, BELT_WINDOW), today));
}

export interface WeekScore {
  weekStart: string;
  officeDays: number;
  belt: number | null;
}

export interface Compliance {
  /** Rolling BELT for the current week (actual to date). */
  current: number | null;
  /** Rolling BELT `horizonWeeks` out, if the forecast holds. */
  projected: number | null;
  band: BeltBand | null;
  target: number;
  /** Trailing weeks (oldest→newest) for a sparkline. */
  series: WeekScore[];
}

export function compliance(
  doc: Doc,
  target: number,
  today: string,
  horizonWeeks = 12,
  trailWeeks = 16,
): Compliance {
  const thisWeekStart = weekStartOf(today);
  const current = beltForWeek(doc, thisWeekStart, today);
  const projected = beltForWeek(doc, addDays(thisWeekStart, 7 * horizonWeeks), today);
  const weekStarts = trailingWeekStarts(thisWeekStart, trailWeeks);
  const office = officeDaysByWeek(doc, weekStarts, today);
  const series: WeekScore[] = weekStarts.map((weekStart, i) => ({
    weekStart,
    officeDays: office[i],
    belt: beltForWeek(doc, weekStart, today),
  }));
  return {
    current,
    projected,
    band: current == null ? null : beltBand(current),
    target,
    series,
  };
}
