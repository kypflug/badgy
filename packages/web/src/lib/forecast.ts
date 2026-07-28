/**
 * Pure helpers for the rail's forecast chart: mapping period scores and future away days onto a
 * shared date axis, so the recorded/projected line and the away-time shading always agree.
 */
import {
  type CalendarNote,
  type PeriodScore,
  parseISO,
  type ResolvedDay,
  type Status,
} from '@badgy/shared';

/** A contiguous shaded span on the forecast chart — a run of future vacation/holiday days. */
export interface AwayBand {
  startDate: string;
  endDate: string;
  /** A calendar note's label when one overlaps the span, else unlabeled. */
  label: string | null;
}

const AWAY_STATUSES: ReadonlySet<Status> = new Set(['vacation', 'holiday']);

/**
 * Group contiguous *future* vacation/holiday days into shaded bands. A band picks up the label of
 * any calendar note overlapping its span; otherwise it renders unlabeled. Past away days are never
 * banded — the forecast only shades time away that hasn't happened yet.
 */
export function computeAwayBands(
  days: readonly Pick<ResolvedDay, 'date' | 'status' | 'isFuture'>[],
  notes: readonly CalendarNote[],
): AwayBand[] {
  const bands: AwayBand[] = [];
  let start: string | null = null;
  let end: string | null = null;
  const flush = (): void => {
    if (start !== null && end !== null) {
      bands.push({ startDate: start, endDate: end, label: labelFor(start, end, notes) });
    }
    start = null;
    end = null;
  };
  for (const day of days) {
    if (day.isFuture && AWAY_STATUSES.has(day.status)) {
      start ??= day.date;
      end = day.date;
    } else {
      flush();
    }
  }
  flush();
  return bands;
}

function labelFor(start: string, end: string, notes: readonly CalendarNote[]): string | null {
  const hit = notes.find((note) => note.label.trim() && note.start <= end && note.end >= start);
  return hit ? hit.label.trim() : null;
}

/** Fraction (0..1) of `date` along the inclusive `[domainStart, domainEnd]` axis, clamped. */
export function xFraction(date: string, domainStart: string, domainEnd: string): number {
  const span = parseISO(domainEnd).getTime() - parseISO(domainStart).getTime();
  if (span <= 0) return 0;
  const offset = parseISO(date).getTime() - parseISO(domainStart).getTime();
  return Math.min(1, Math.max(0, offset / span));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** SVG polyline `points` for a period-score series plotted against the shared date axis. */
export function seriesPoints(
  points: readonly Pick<PeriodScore, 'end' | 'score'>[],
  domainStart: string,
  domainEnd: string,
  width: number,
  height: number,
): string {
  return points
    .filter((p): p is Pick<PeriodScore, 'end' | 'score'> & { score: number } => p.score != null)
    .map((p) => {
      const x = xFraction(p.end, domainStart, domainEnd) * width;
      const y = height * (1 - Math.min(1, p.score));
      return `${round(x)},${round(y)}`;
    })
    .join(' ');
}
