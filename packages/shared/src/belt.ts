/**
 * BELT — "Best Eight of Last Twelve" rolling office-attendance score.
 * The average of the 8 largest weekly office-day counts over a 12-week window, divided by 5
 * (a full week). Pure number-series core; per-date wiring lives in compliance.ts.
 */

export const BELT_WINDOW = 12;
export const BELT_BEST = 8;
export const BELT_DIVISOR = 5;
/** First score lands on the 13th tracked week (the window starts at i=12). */
export const BELT_FIRST_INDEX = BELT_WINDOW;

export const BELT_WARNING_THRESHOLD = 0.8;
export const BELT_SUCCESS_THRESHOLD = 0.9;

/** Core: average of the BELT_BEST largest values in `window`, ÷5. null if empty. */
export function beltOf(window: readonly number[]): number | null {
  if (window.length === 0) return null;
  const best = [...window].sort((a, b) => b - a).slice(0, BELT_BEST);
  let sum = 0;
  for (const v of best) sum += v;
  return sum / BELT_BEST / BELT_DIVISOR;
}

/**
 * Rolling score over a full series (used by parity tests): defined for `i >= 12`, window
 * `[i-11 … i]` (so the very first tracked week never enters a window).
 */
export function beltAt(officeSeq: readonly number[], i: number): number | null {
  if (i < BELT_FIRST_INDEX) return null;
  return beltOf(officeSeq.slice(i - BELT_WINDOW + 1, i + 1));
}

export function beltSeries(officeSeq: readonly number[]): (number | null)[] {
  return officeSeq.map((_, i) => beltAt(officeSeq, i));
}

export type BeltBand = 'danger' | 'warning' | 'success';

export function beltBand(belt: number): BeltBand {
  if (belt < BELT_WARNING_THRESHOLD) return 'danger';
  if (belt < BELT_SUCCESS_THRESHOLD) return 'warning';
  return 'success';
}
