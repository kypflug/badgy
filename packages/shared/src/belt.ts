/**
 * BELT — "Best Eight of Last Twelve" rolling attendance score.
 *
 * Transcribed verbatim from the source spreadsheet, e.g. cell I17:
 *   =(AVERAGE(LARGE(H6:H17,{1,2,3,4,5,6,7,8})))/5
 * where column H (Office Days) = COUNTIF(Mon:Fri,"Office") + COUNTIF(Mon:Fri,"Planned").
 *
 * For week index `i` (0-based, weeks ascending by date):
 *   BELT(i) = average(8 largest Office-Day counts in weeks [i-11 … i]) / 5
 * expressed as a fraction of a 5-day week.
 *
 * Faithful quirk (matches the template exactly): scoring starts at the 13th tracked
 * week (`i = 12`), and the window [i-11 … i] therefore never includes the very first
 * tracked week (index 0). Pinned by parity tests against the Excel's own values.
 */
import { DAY_KEYS, type Status, type Week, type WeekDays } from './types.js';

/** Trailing weeks considered for the score. */
export const BELT_WINDOW = 12;
/** Best-N weeks averaged within the window. */
export const BELT_BEST = 8;
/** Days in a "full" week — the score's denominator. */
export const BELT_DIVISOR = 5;
/**
 * First scored week index (0-based). A week needs 12 weeks of prior history, so the
 * first score appears at the 13th tracked week — matching the template (first BELT at row 17).
 */
export const BELT_FIRST_INDEX = BELT_WINDOW;

/** BELT compliance bands, matching the template's conditional formatting. */
export const BELT_WARNING_THRESHOLD = 0.8;
export const BELT_SUCCESS_THRESHOLD = 0.9;

const COUNTS_AS_OFFICE = new Set<Status>(['Office', 'Planned']);

/** Number of Mon–Fri days marked Office or Planned. */
export function officeDays(days: WeekDays): number {
  let n = 0;
  for (const k of DAY_KEYS) if (COUNTS_AS_OFFICE.has(days[k])) n++;
  return n;
}

/** Number of Mon–Fri days marked DTO. */
export function dtoDays(days: WeekDays): number {
  let n = 0;
  for (const k of DAY_KEYS) if (days[k] === 'DTO') n++;
  return n;
}

/**
 * Rolling BELT score for the week at index `i` given the full ascending sequence of
 * weekly Office-Day counts. Returns `null` until enough history exists (`i < BELT_FIRST_INDEX`).
 */
export function beltAt(officeSeq: readonly number[], i: number): number | null {
  if (i < BELT_FIRST_INDEX) return null;
  const window = officeSeq.slice(i - BELT_WINDOW + 1, i + 1); // 12 values ending at i
  const best = [...window].sort((a, b) => b - a).slice(0, BELT_BEST);
  let sum = 0;
  for (const v of best) sum += v;
  return sum / BELT_BEST / BELT_DIVISOR;
}

/** BELT score for every week (null where history is insufficient). */
export function beltSeries(officeSeq: readonly number[]): (number | null)[] {
  return officeSeq.map((_, i) => beltAt(officeSeq, i));
}

export type BeltBand = 'danger' | 'warning' | 'success';

/** Compliance band for a BELT fraction: <80% danger, 80–90% warning, ≥90% success. */
export function beltBand(belt: number): BeltBand {
  if (belt < BELT_WARNING_THRESHOLD) return 'danger';
  if (belt < BELT_SUCCESS_THRESHOLD) return 'warning';
  return 'success';
}

export interface WeekComputed {
  weekStart: string;
  officeDays: number;
  dtoDays: number;
  /** BELT as a fraction (0–1), or null if not enough history yet. */
  belt: number | null;
  meetup: boolean;
}

/** Compute Office Days, DTO Days, and rolling BELT for a year's weeks. */
export function computeWeeks(weeks: readonly Week[]): WeekComputed[] {
  const office = weeks.map((w) => officeDays(w.days));
  return weeks.map((w, i) => ({
    weekStart: w.weekStart,
    officeDays: office[i],
    dtoDays: dtoDays(w.days),
    belt: beltAt(office, i),
    meetup: w.meetup,
  }));
}

/** Totals row (matches the template's SUBTOTAL of Office Days and DTO Days). */
export function totals(weeks: readonly Week[]): { officeDays: number; dtoDays: number } {
  let office = 0;
  let dto = 0;
  for (const w of weeks) {
    office += officeDays(w.days);
    dto += dtoDays(w.days);
  }
  return { officeDays: office, dtoDays: dto };
}
