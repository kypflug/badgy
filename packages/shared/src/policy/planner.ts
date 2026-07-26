import { addDays, trailingWeekStarts, weekdayOf, weekStartOf } from '../calendar.js';
import { type Doc, resolveRange } from '../sync/doc.js';
import { isWeekend } from '../types.js';
import { evaluate, officeDaysForWeek, periodBoundsOf } from './engine.js';
import type { ComplianceScheme } from './types.js';
import { schemePeriod, schemeWeeklyCap } from './types.js';

export interface ProjectionResult {
  /** Min office days/week (0–5) that meets the goal, or null if even a full week can't. */
  requiredPerWeek: number | null;
  /** Projected score for each of the `horizon` future weeks at `requiredPerWeek`. */
  projected: (number | null)[];
  achievable: boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function bestOf(counts: readonly number[], scheme: ComplianceScheme): number | null {
  if (scheme.kind !== 'best-of-window' || counts.length === 0) return null;
  const best = counts
    .map((count) => Math.min(count, scheme.weeklyCap))
    .sort((a, b) => b - a)
    .slice(0, scheme.bestCount);
  let sum = 0;
  for (const value of best) sum += value;
  return sum / scheme.bestCount / scheme.weeklyCap;
}

function weeklyRequired(scheme: ComplianceScheme, scheduledDays: number): number {
  switch (scheme.kind) {
    case 'weekly-quota':
    case 'qualifying-weeks':
      return scheme.absence.proration === 'prorate'
        ? Math.min(scheme.daysPerWeek, scheduledDays)
        : scheme.daysPerWeek;
    default:
      return 0;
  }
}

function weeklyAttainment(officeDays: number, requiredDays: number): number {
  return requiredDays === 0 ? 1 : Math.min(1, officeDays / requiredDays);
}

function projectWeekly(
  doc: Doc,
  scheme: ComplianceScheme,
  today: string,
  horizon: number,
  perWeek: number,
): (number | null)[] {
  const thisWeekStart = weekStartOf(today);
  if (scheme.kind === 'best-of-window') {
    const series = trailingWeekStarts(thisWeekStart, scheme.windowWeeks).map((weekStart) =>
      officeDaysForWeek(doc, weekStart, scheme, today),
    );
    const out: (number | null)[] = [];
    for (let w = 0; w < horizon; w++) {
      series.push(Math.min(perWeek, scheme.weeklyCap));
      out.push(bestOf(series.slice(series.length - scheme.windowWeeks), scheme));
    }
    return out;
  }
  if (scheme.kind === 'qualifying-weeks') {
    const qualifying = trailingWeekStarts(thisWeekStart, scheme.windowWeeks).map((weekStart) => {
      const week = evaluate(doc, scheme, 1, weekStart, { horizonPeriods: 0, trailPeriods: 1 })
        .series[0];
      return week.officeDays >= week.requiredDays;
    });
    const out: (number | null)[] = [];
    const futureRequired = weeklyRequired(scheme, 5);
    for (let w = 0; w < horizon; w++) {
      qualifying.push(perWeek >= futureRequired);
      const window = qualifying.slice(qualifying.length - scheme.windowWeeks);
      out.push(clamp01(window.filter(Boolean).length / scheme.minQualifying));
    }
    return out;
  }
  if (scheme.kind === 'weekly-quota') {
    const attainments = trailingWeekStarts(thisWeekStart, scheme.averagingWeeks).map(
      (weekStart) => {
        const week = evaluate(doc, scheme, 1, weekStart, { horizonPeriods: 0, trailPeriods: 1 })
          .series[0];
        return week.attainment ?? 0;
      },
    );
    const out: (number | null)[] = [];
    const futureAttainment = weeklyAttainment(perWeek, weeklyRequired(scheme, 5));
    for (let w = 0; w < horizon; w++) {
      attainments.push(futureAttainment);
      const window = attainments.slice(attainments.length - scheme.averagingWeeks);
      out.push(window.reduce((sum, value) => sum + value, 0) / scheme.averagingWeeks);
    }
    return out;
  }
  return [];
}

function fixedRequired(
  scheme: ComplianceScheme,
  scheduledDays: number,
  baselineDays: number,
): number {
  if (scheme.kind === 'period-percentage') {
    return Math.round(
      scheme.percent * (scheme.absence.proration === 'ignore' ? baselineDays : scheduledDays),
    );
  }
  if (scheme.kind !== 'period-quota') return 0;
  if (scheme.absence.proration === 'ignore') return scheme.days;
  if (baselineDays === 0) return 0;
  return Math.max(
    0,
    Math.min(scheme.days, Math.ceil((scheme.days * scheduledDays) / baselineDays)),
  );
}

function projectFixed(
  doc: Doc,
  scheme: ComplianceScheme,
  today: string,
  horizon: number,
  perWeek: number,
): (number | null)[] {
  const thisWeekStart = weekStartOf(today);
  const firstProjectedWeek = addDays(thisWeekStart, 7);
  const out: (number | null)[] = [];
  for (let w = 1; w <= horizon; w++) {
    const weekStart = addDays(thisWeekStart, w * 7);
    const bounds = periodBoundsOf(weekStart, schemePeriod(scheme));
    let officeDays = 0;
    let scheduledDays = 0;
    let baselineDays = 0;
    for (let day = bounds.start; day <= bounds.end; day = addDays(day, 1)) {
      const weekday = weekdayOf(day);
      if (!isWeekend(weekday)) baselineDays++;
      if (day < firstProjectedWeek) {
        const resolved = resolveRange(doc, day, day, today)[0];
        const office =
          resolved.status === 'office' ||
          (resolved.status === 'travel' && scheme.absence.travelCountsAsOffice);
        const excused =
          !office &&
          ((resolved.status !== 'none' && scheme.absence.excused.includes(resolved.status)) ||
            (resolved.isWeekend && resolved.status === 'none'));
        if (office) officeDays++;
        if (!excused) scheduledDays++;
        continue;
      }
      if (!isWeekend(weekday)) {
        scheduledDays++;
        if (weekday >= 1 && weekday <= perWeek) officeDays++;
      }
    }
    const required = fixedRequired(scheme, scheduledDays, baselineDays);
    out.push(required === 0 ? 1 : Math.min(1, officeDays / required));
  }
  return out;
}

function project(
  doc: Doc,
  scheme: ComplianceScheme,
  today: string,
  horizon: number,
  perWeek: number,
): (number | null)[] {
  if (scheme.kind === 'period-quota' || scheme.kind === 'period-percentage') {
    return projectFixed(doc, scheme, today, horizon, perWeek);
  }
  return projectWeekly(doc, scheme, today, horizon, perWeek);
}

function meetsGoal(projected: (number | null)[], target: number, hold: boolean): boolean {
  const scored = projected.filter((score): score is number => score !== null);
  if (scored.length === 0) return false;
  return hold
    ? scored.every((score) => score >= target - 1e-9)
    : scored[scored.length - 1] >= target - 1e-9;
}

export function planOfficeDays(
  doc: Doc,
  scheme: ComplianceScheme,
  today: string,
  horizon: number,
  target: number,
  hold = true,
): ProjectionResult {
  if (scheme.kind === 'none') {
    return { requiredPerWeek: 0, projected: Array<number>(horizon).fill(1), achievable: true };
  }
  const cap = Math.min(5, schemeWeeklyCap(scheme));
  for (let d = 0; d <= cap; d++) {
    const projected = project(doc, scheme, today, horizon, d);
    if (meetsGoal(projected, target, hold)) {
      return { requiredPerWeek: d, projected, achievable: true };
    }
  }
  return {
    requiredPerWeek: null,
    projected: project(doc, scheme, today, horizon, cap),
    achievable: false,
  };
}
