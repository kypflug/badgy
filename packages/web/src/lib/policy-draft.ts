/**
 * Pure helpers for the Workplace policy draft/effect experience: the draft value shape, equality
 * for the unsaved-changes guard, plain-language scheme copy, and the old/new score-effect series
 * and explanation. Store-free and DOM-free so it's fully unit-testable — `settings-page.ts` and
 * `settings-policy-section.ts` supply the live `store`/`ComplianceResult` data.
 */
import type { ComplianceResult, ComplianceScheme, HolidayRegionId, OrgPreset } from '@badgy/shared';
import { seriesPoints } from './forecast.js';

/** The uncommitted workplace policy edit — mirrors `store.PolicyDraft`, kept local until Keep. */
export interface PolicyDraftValue {
  orgId: string;
  scheme: ComplianceScheme;
  target: number;
  holidayRegion: HolidayRegionId;
}

/** A fresh draft matching a workplace preset's own values — used when the preset selection changes. */
export function draftFromOrg(org: OrgPreset): PolicyDraftValue {
  return { orgId: org.id, scheme: org.scheme, target: org.target, holidayRegion: org.holidaySet };
}

/** Structural equality, since `scheme` is a plain JSON-serializable object. */
export function draftEqual(a: PolicyDraftValue, b: PolicyDraftValue): boolean {
  return (
    a.orgId === b.orgId &&
    a.target === b.target &&
    a.holidayRegion === b.holidayRegion &&
    JSON.stringify(a.scheme) === JSON.stringify(b.scheme)
  );
}

/** True once the draft's scheme has diverged from its workplace preset's own scheme. */
export function draftSchemeIsCustom(scheme: ComplianceScheme, org: OrgPreset): boolean {
  return JSON.stringify(scheme) !== JSON.stringify(org.scheme);
}

const unit = (n: number): string => (n === 1 ? 'day' : 'days');
const weeksUnit = (n: number): string => (n === 1 ? 'week' : 'weeks');

/** A full-sentence, plain-language restatement of a scheme's rule, for every scheme kind. */
export function describeScheme(scheme: ComplianceScheme): string {
  switch (scheme.kind) {
    case 'best-of-window':
      return (
        `Counts your best ${scheme.bestCount} of the last ${scheme.windowWeeks} ${weeksUnit(scheme.windowWeeks)}, ` +
        `capping each week at ${scheme.weeklyCap} office ${unit(scheme.weeklyCap)}.`
      );
    case 'qualifying-weeks':
      return (
        `Needs ${scheme.minQualifying} of the last ${scheme.windowWeeks} ${weeksUnit(scheme.windowWeeks)} to each ` +
        `hit ${scheme.daysPerWeek} office ${unit(scheme.daysPerWeek)}.`
      );
    case 'weekly-quota':
      return scheme.averagingWeeks > 1
        ? `Needs ${scheme.daysPerWeek} office ${unit(scheme.daysPerWeek)} a week on average, over a ${scheme.averagingWeeks}-week rolling window.`
        : `Needs ${scheme.daysPerWeek} office ${unit(scheme.daysPerWeek)} every week.`;
    case 'period-quota':
      return `Needs ${scheme.days} office ${unit(scheme.days)} a ${scheme.period}.`;
    case 'period-percentage':
      return `Needs ${Math.round(scheme.percent * 100)}% of working days a ${scheme.period} in the office.`;
    case 'none':
      return 'No office attendance requirement — your score always reads 100%.';
  }
}

/** A concise, scheme-aware read of what the draft would change about the user's score. */
export function describeEffect(baseline: ComplianceResult, draft: ComplianceResult): string {
  if (baseline.current == null || draft.current == null) {
    return 'Not enough attendance history yet to compare — this fills in as you log office days.';
  }
  const deltaPts = Math.round((draft.current - baseline.current) * 100);
  if (deltaPts === 0) return `Your score would stay about the same — ${draft.headline}.`;
  const magnitude = Math.abs(deltaPts);
  const direction = deltaPts > 0 ? 'up' : 'down';
  return `Your score would go ${direction} ${magnitude} point${magnitude === 1 ? '' : 's'} — ${draft.headline}.`;
}

export interface EffectSeries {
  domainStart: string;
  domainEnd: string;
  oldPoints: string;
  newPoints: string;
}

/**
 * Old/new SVG polylines for the effect panel, on a shared date axis spanning whichever of the two
 * results runs longer (the two can differ, e.g. a weekly scheme compared against a quarterly one).
 */
export function buildEffectSeries(
  baseline: ComplianceResult,
  draft: ComplianceResult,
  width: number,
  height: number,
): EffectSeries {
  const starts = [baseline.series[0]?.start, draft.series[0]?.start].filter(
    (s): s is string => !!s,
  );
  const ends = [
    baseline.futureSeries.at(-1)?.end ?? baseline.series.at(-1)?.end,
    draft.futureSeries.at(-1)?.end ?? draft.series.at(-1)?.end,
  ].filter((s): s is string => !!s);
  const domainStart = starts.sort()[0];
  const domainEnd = ends.sort().at(-1);
  if (!domainStart || !domainEnd)
    return { domainStart: '', domainEnd: '', oldPoints: '', newPoints: '' };
  return {
    domainStart,
    domainEnd,
    oldPoints: seriesPoints(
      [...baseline.series, ...baseline.futureSeries],
      domainStart,
      domainEnd,
      width,
      height,
    ),
    newPoints: seriesPoints(
      [...draft.series, ...draft.futureSeries],
      domainStart,
      domainEnd,
      width,
      height,
    ),
  };
}

/**
 * Gate for any navigation that would abandon an unsaved policy draft. `confirmDiscard` is
 * injectable so this is testable without a real dialog; the default is the repo's plain
 * `window.confirm` (a direct native dialog, not a custom in-app modal).
 */
export function guardPolicyNavigation(
  isDirty: boolean,
  confirmDiscard: () => boolean = () =>
    window.confirm('Discard your unsaved workplace policy changes?'),
): boolean {
  if (!isDirty) return true;
  return confirmDiscard();
}
