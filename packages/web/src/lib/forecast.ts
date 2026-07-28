/**
 * Pure helpers for the rail's forecast chart: mapping period scores and future away days onto a
 * shared date axis, so the recorded/projected line and the away-time shading always agree.
 */
import {
  addDays,
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
}

const AWAY_STATUSES: ReadonlySet<Status> = new Set(['vacation', 'holiday']);

/**
 * Group future vacation/holiday days into shaded bands, bridging untracked gaps such as weekends.
 * Past away days are never banded — the forecast only shades time away that hasn't happened yet.
 */
export function computeAwayBands(
  days: readonly Pick<ResolvedDay, 'date' | 'status' | 'isFuture'>[],
): AwayBand[] {
  const bands: AwayBand[] = [];
  let start: string | null = null;
  let end: string | null = null;
  const flush = (): void => {
    if (start !== null && end !== null) {
      bands.push({ startDate: start, endDate: end });
    }
    start = null;
    end = null;
  };
  for (const day of days) {
    if (day.isFuture && AWAY_STATUSES.has(day.status)) {
      start ??= day.date;
      end = day.date;
    } else if (start === null || !day.isFuture || day.status !== 'none') {
      flush();
    }
  }
  flush();
  return bands;
}

export interface ForecastAnnotation {
  id: string;
  startDate: string;
  endDate: string;
  label: string;
  color: string;
}

export interface ForecastAnnotationLayout extends ForecastAnnotation {
  startX: number;
  endX: number;
  labelX: number;
  lane: number;
}

/**
 * Clip each risk-relevant calendar note to the visible forecast domain. A note is relevant when
 * its visible range contains a tracked non-office day, and appears once even across multiple runs.
 */
export function computeForecastAnnotations(
  notes: readonly CalendarNote[],
  days: readonly Pick<ResolvedDay, 'date' | 'status'>[],
  domainStart: string,
  domainEnd: string,
): ForecastAnnotation[] {
  const trackedNonOfficeDates = days
    .filter((day) => day.status !== 'office' && day.status !== 'none')
    .map((day) => day.date);
  return notes
    .filter(
      (note) =>
        note.label.trim() &&
        note.start <= domainEnd &&
        note.end >= domainStart &&
        trackedNonOfficeDates.some((date) => note.start <= date && note.end >= date),
    )
    .map((note) => ({
      id: note.id,
      startDate: note.start < domainStart ? domainStart : note.start,
      endDate: note.end > domainEnd ? domainEnd : note.end,
      label: note.label.trim(),
      color: note.color,
    }))
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        a.endDate.localeCompare(b.endDate) ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id),
    );
}

const FORECAST_LABEL_CHAR_WIDTH = 5.4;
const FORECAST_LABEL_GAP = 4;

/**
 * Place annotation labels into the first lane where their estimated text boxes do not overlap.
 * The chart is intentionally small, so nearby notes stack upward rather than obscuring each other.
 */
export function layoutForecastAnnotations(
  annotations: readonly ForecastAnnotation[],
  domainStart: string,
  domainEnd: string,
  width: number,
): ForecastAnnotationLayout[] {
  const laneEnds: number[] = [];
  return annotations.map((annotation) => {
    const startX = xFraction(annotation.startDate, domainStart, domainEnd) * width;
    const endX = Math.max(
      startX + 2,
      xFraction(addDays(annotation.endDate, 1), domainStart, domainEnd) * width,
    );
    const labelWidth = Math.min(width, annotation.label.length * FORECAST_LABEL_CHAR_WIDTH);
    const halfLabel = labelWidth / 2;
    const labelX = Math.min(width - halfLabel, Math.max(halfLabel, (startX + endX) / 2));
    const labelLeft = labelX - halfLabel;
    const labelRight = labelX + halfLabel;
    let lane = laneEnds.findIndex((end) => labelLeft >= end + FORECAST_LABEL_GAP);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = labelRight;
    return { ...annotation, startX, endX, labelX, lane };
  });
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
