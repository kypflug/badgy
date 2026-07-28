import { addDays, trailingWeekStarts, weekStartOf } from '../calendar.js';
import { type Doc, resolveRange } from '../sync/doc.js';
import { isWeekend } from '../types.js';
import {
  bandOf,
  type ComplianceResult,
  type ComplianceScheme,
  type PeriodScore,
  type SchemePeriod,
  schemePeriod,
} from './types.js';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

interface BucketCounts {
  officeDays: number;
  scheduledDays: number;
  excusedDays: number;
  baselineScheduledDays: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ymd(iso: string): { year: number; month: number; day: number } {
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  };
}

function isoOf(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftMonthStart(start: string, delta: number): string {
  const { year, month } = ymd(start);
  const absoluteMonth = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(absoluteMonth / 12);
  return isoOf(nextYear, absoluteMonth - nextYear * 12 + 1, 1);
}

function shiftPeriodStart(start: string, period: SchemePeriod, delta: number): string {
  if (period === 'week') return addDays(start, delta * 7);
  if (period === 'month') return shiftMonthStart(start, delta);
  return shiftMonthStart(start, delta * 3);
}

function periodStartsEndingAt(endStart: string, period: SchemePeriod, count: number): string[] {
  if (period === 'week') return trailingWeekStarts(endStart, count);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(shiftPeriodStart(endStart, period, -i));
  return out;
}

export function periodBoundsOf(iso: string, period: SchemePeriod): { start: string; end: string } {
  if (period === 'week') {
    const start = weekStartOf(iso);
    return { start, end: addDays(start, 6) };
  }
  const { year, month } = ymd(iso);
  if (period === 'month') {
    const start = isoOf(year, month, 1);
    return { start, end: addDays(shiftMonthStart(start, 1), -1) };
  }
  const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const start = isoOf(year, quarterMonth, 1);
  return { start, end: addDays(shiftMonthStart(start, 3), -1) };
}

export function periodLabelOf(start: string, period: SchemePeriod): string {
  const { year, month, day } = ymd(start);
  if (period === 'week') return `Week of ${SHORT_MONTH_NAMES[month - 1]} ${day}`;
  if (period === 'month') return `${MONTH_NAMES[month - 1]} ${year}`;
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

function countBucket(
  doc: Doc,
  start: string,
  end: string,
  scheme: ComplianceScheme,
  today: string,
): BucketCounts {
  let officeDays = 0;
  let scheduledDays = 0;
  let excusedDays = 0;
  let baselineScheduledDays = 0;
  for (const day of resolveRange(doc, start, end, today)) {
    if (!isWeekend(day.weekday)) baselineScheduledDays++;
    const officeDay =
      day.status === 'office' || (day.status === 'travel' && scheme.absence.travelCountsAsOffice);
    const excusedDay =
      !officeDay &&
      ((day.status !== 'none' && scheme.absence.excused.includes(day.status)) ||
        (day.isWeekend && day.status === 'none'));
    if (officeDay) officeDays++;
    if (excusedDay) excusedDays++;
    else scheduledDays++;
  }
  return { officeDays, scheduledDays, excusedDays, baselineScheduledDays };
}

function requiredDays(
  scheme: ComplianceScheme,
  scheduledDays: number,
  baselineScheduledDays: number,
): number {
  switch (scheme.kind) {
    case 'none':
      return 0;
    case 'period-percentage':
      return Math.round(
        scheme.percent *
          (scheme.absence.proration === 'ignore' ? baselineScheduledDays : scheduledDays),
      );
    case 'period-quota':
      if (scheme.absence.proration === 'ignore') return scheme.days;
      if (baselineScheduledDays === 0) return 0;
      return clamp(
        Math.ceil((scheme.days * scheduledDays) / baselineScheduledDays),
        0,
        scheme.days,
      );
    case 'best-of-window':
      return scheme.absence.proration === 'prorate'
        ? Math.min(scheme.weeklyCap, scheduledDays)
        : scheme.weeklyCap;
    case 'qualifying-weeks':
      return scheme.absence.proration === 'prorate'
        ? Math.min(scheme.daysPerWeek, scheduledDays)
        : scheme.daysPerWeek;
    case 'weekly-quota':
      return scheme.absence.proration === 'prorate'
        ? Math.min(scheme.daysPerWeek, scheduledDays)
        : scheme.daysPerWeek;
  }
}

function bucketScore(
  doc: Doc,
  start: string,
  period: SchemePeriod,
  scheme: ComplianceScheme,
  today: string,
): PeriodScore {
  const { end } = periodBoundsOf(start, period);
  const counts = countBucket(doc, start, end, scheme, today);
  const required = requiredDays(scheme, counts.scheduledDays, counts.baselineScheduledDays);
  return {
    start,
    end,
    label: periodLabelOf(start, period),
    officeDays: counts.officeDays,
    scheduledDays: counts.scheduledDays,
    excusedDays: counts.excusedDays,
    requiredDays: required,
    attainment: required === 0 ? 1 : Math.min(1, counts.officeDays / required),
    score: null,
  };
}

function scoreBestOfWindow(counts: readonly number[], scheme: ComplianceScheme): number | null {
  if (scheme.kind !== 'best-of-window' || counts.length === 0) return null;
  const best = counts
    .map((count) => Math.min(count, scheme.weeklyCap))
    .sort((a, b) => b - a)
    .slice(0, scheme.bestCount);
  let sum = 0;
  for (const value of best) sum += value;
  return sum / scheme.bestCount / scheme.weeklyCap;
}

export function bestOfWindowSeries(
  officeSeq: readonly number[],
  scheme: ComplianceScheme,
): (number | null)[] {
  if (scheme.kind !== 'best-of-window') return officeSeq.map(() => null);
  return officeSeq.map((_, i) => {
    if (i < scheme.windowWeeks) return null;
    return scoreBestOfWindow(officeSeq.slice(i - scheme.windowWeeks + 1, i + 1), scheme);
  });
}

function periodScoreAt(
  doc: Doc,
  start: string,
  period: SchemePeriod,
  scheme: ComplianceScheme,
  today: string,
): number | null {
  switch (scheme.kind) {
    case 'none':
      return 1;
    case 'best-of-window':
      return scoreBestOfWindow(
        trailingWeekStarts(start, scheme.windowWeeks).map((weekStart) =>
          officeDaysForWeek(doc, weekStart, scheme, today),
        ),
        scheme,
      );
    case 'qualifying-weeks': {
      let qualifying = 0;
      for (const weekStart of trailingWeekStarts(start, scheme.windowWeeks)) {
        const week = bucketScore(doc, weekStart, 'week', scheme, today);
        if (week.officeDays >= week.requiredDays) qualifying++;
      }
      return Math.min(1, qualifying / scheme.minQualifying);
    }
    case 'weekly-quota': {
      let sum = 0;
      for (const weekStart of trailingWeekStarts(start, scheme.averagingWeeks)) {
        const week = bucketScore(doc, weekStart, 'week', scheme, today);
        sum += week.attainment ?? 0;
      }
      return sum / scheme.averagingWeeks;
    }
    case 'period-quota':
    case 'period-percentage':
      return bucketScore(doc, start, period, scheme, today).attainment;
  }
}

function scoredBucket(
  doc: Doc,
  start: string,
  period: SchemePeriod,
  scheme: ComplianceScheme,
  today: string,
): PeriodScore {
  return {
    ...bucketScore(doc, start, period, scheme, today),
    score: periodScoreAt(doc, start, period, scheme, today),
  };
}

export function officeDaysForWeek(
  doc: Doc,
  weekStart: string,
  scheme: ComplianceScheme,
  today: string,
): number {
  const counts = countBucket(doc, weekStart, addDays(weekStart, 6), scheme, today);
  return scheme.kind === 'best-of-window'
    ? Math.min(counts.officeDays, scheme.weeklyCap)
    : counts.officeDays;
}

export function weekScore(
  doc: Doc,
  weekStart: string,
  scheme: ComplianceScheme,
  today: string,
): number | null {
  const period = schemePeriod(scheme);
  const start = periodBoundsOf(weekStart, period).start;
  return periodScoreAt(doc, start, period, scheme, today);
}

function defaultHorizon(period: SchemePeriod): number {
  if (period === 'week') return 12;
  if (period === 'month') return 2;
  return 1;
}

function defaultTrail(period: SchemePeriod): number {
  if (period === 'week') return 16;
  if (period === 'month') return 6;
  return 4;
}

function headline(score: PeriodScore, period: SchemePeriod, scheme: ComplianceScheme): string {
  const unit = (n: number): string => (n === 1 ? 'day' : 'days');
  // Past the requirement, "64 of 10" reads like a shortfall — lead with what was actually needed.
  const progress = (bucket: string): string =>
    score.officeDays > score.requiredDays
      ? `${score.officeDays} ${unit(score.officeDays)} this ${bucket} — ${score.requiredDays} needed`
      : `${score.officeDays} of ${score.requiredDays} ${unit(score.requiredDays)} this ${bucket}`;
  switch (scheme.kind) {
    case 'none':
      return 'No office requirement';
    case 'best-of-window':
      return `Best ${scheme.bestCount} of the last ${scheme.windowWeeks} weeks`;
    case 'weekly-quota':
    case 'qualifying-weeks':
      return progress('week');
    case 'period-quota':
    case 'period-percentage':
      return progress(period);
  }
}

export function evaluate(
  doc: Doc,
  scheme: ComplianceScheme,
  target: number,
  today: string,
  options: { horizonPeriods?: number; trailPeriods?: number } = {},
): ComplianceResult {
  const unit = schemePeriod(scheme);
  const currentStart = periodBoundsOf(today, unit).start;
  const horizonPeriods = options.horizonPeriods ?? defaultHorizon(unit);
  const trailPeriods = options.trailPeriods ?? defaultTrail(unit);
  const currentBucket = scoredBucket(doc, currentStart, unit, scheme, today);
  const current = periodScoreAt(doc, currentStart, unit, scheme, today);
  const futureSeries = Array.from({ length: horizonPeriods }, (_, index) =>
    scoredBucket(doc, shiftPeriodStart(currentStart, unit, index + 1), unit, scheme, today),
  );
  const projected = futureSeries.at(-1)?.score ?? current;
  return {
    current,
    projected,
    band: current == null ? null : bandOf(current, scheme.bands),
    target,
    unit,
    series: periodStartsEndingAt(currentStart, unit, trailPeriods).map((start) =>
      scoredBucket(doc, start, unit, scheme, today),
    ),
    futureSeries,
    headline: headline(currentBucket, unit, scheme),
  };
}
