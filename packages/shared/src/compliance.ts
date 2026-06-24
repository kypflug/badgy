/** Per-date → BELT: weekly office days, rolling score, and actual-vs-projected compliance. */
import { BELT_WINDOW, type BeltBand, beltBand, beltOf } from './belt.js';
import { addDays, trailingMondays, weekStartOf } from './calendar.js';
import { type Doc, resolveRange } from './sync/doc.js';
import { countsAsOffice } from './types.js';

/** Office days (Mon–Fri resolved `office`) for each Monday in `mondays`. */
export function officeDaysByWeek(doc: Doc, mondays: readonly string[], today?: string): number[] {
  return mondays.map((mon) => {
    const week = resolveRange(doc, mon, addDays(mon, 4), today); // Mon..Fri
    let n = 0;
    for (const d of week) if (countsAsOffice(d.status)) n++;
    return n;
  });
}

/** BELT for a target week = best-8 of the trailing 12 weeks' office days, ÷5. */
export function beltForWeek(doc: Doc, targetMonday: string, today?: string): number | null {
  return beltOf(officeDaysByWeek(doc, trailingMondays(targetMonday, BELT_WINDOW), today));
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
  const thisMonday = weekStartOf(today);
  const current = beltForWeek(doc, thisMonday, today);
  const projected = beltForWeek(doc, addDays(thisMonday, 7 * horizonWeeks), today);
  const mondays = trailingMondays(thisMonday, trailWeeks);
  const office = officeDaysByWeek(doc, mondays, today);
  const series: WeekScore[] = mondays.map((weekStart, i) => ({
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
