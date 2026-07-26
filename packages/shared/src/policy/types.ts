/**
 * Compliance-scheme taxonomy — the shape of an organisation's return-to-office rule.
 *
 * Badgy started with exactly one rule (Microsoft's BELT). Real employers measure attendance in
 * several distinct ways, so a scheme is described declaratively here and evaluated by `engine.ts`.
 * Every scheme normalises to the same `0..1` *attainment* value so the ring, sparkline, bands and
 * planner render identically regardless of which employer a user picked.
 */
import type { PickableStatus, Status, Weekday } from '../types.js';

/** The bucket a scheme accumulates attendance into. */
export type SchemePeriod = 'week' | 'month' | 'quarter';

/** Periods a fixed-window scheme can be anchored to (weeks are handled by the rolling kinds). */
export type FixedPeriod = 'month' | 'quarter';

export type Band = 'danger' | 'warning' | 'success';

/** Attainment thresholds. Below `warn` is danger; at or above `success` is success. */
export interface Bands {
  warn: number;
  success: number;
}

/**
 * What to do with a day the employer would not expect you in the office.
 * - `ignore` — the requirement is unchanged. BELT uses this: its best-N-of-M window *is* the grace.
 * - `prorate` — scale the period's requirement by the fraction of the period actually scheduled,
 *   so a week with three days of leave asks for proportionally fewer office days.
 */
export type AbsenceProration = 'prorate' | 'ignore';

export interface AbsencePolicy {
  /** Statuses that count as an excused absence rather than a missed office day. */
  excused: readonly PickableStatus[];
  /** Whether business travel is credited as office attendance. Publicly unconfirmed almost everywhere. */
  travelCountsAsOffice: boolean;
  proration: AbsenceProration;
}

/** Archetype A — Microsoft BELT: mean of the `bestCount` largest weekly counts over `windowWeeks`. */
export interface BestOfWindowScheme {
  kind: 'best-of-window';
  windowWeeks: number;
  bestCount: number;
  /** Office days credited per week are capped here, and it is the per-week divisor. */
  weeklyCap: number;
}

/** Archetype B — each week passes at `daysPerWeek`; you need `minQualifying` passes in the window. */
export interface QualifyingWeeksScheme {
  kind: 'qualifying-weeks';
  windowWeeks: number;
  minQualifying: number;
  daysPerWeek: number;
}

/** Archetypes C and D — N days a week. `daysPerWeek: 5` expresses a full in-office mandate. */
export interface WeeklyQuotaScheme {
  kind: 'weekly-quota';
  daysPerWeek: number;
  /** 1 evaluates each week alone; higher values smooth attainment over a rolling window. */
  averagingWeeks: number;
  /** Weekdays the employer names explicitly (e.g. Apple's Tue/Thu). Display-only. */
  anchorDays?: readonly Weekday[];
}

/** Archetype E — an absolute day count inside a fixed calendar period (Salesforce: 10 a quarter). */
export interface PeriodQuotaScheme {
  kind: 'period-quota';
  period: FixedPeriod;
  days: number;
}

/** Archetype F — a fraction of the working days in a fixed calendar period. */
export interface PeriodPercentageScheme {
  kind: 'period-percentage';
  period: FixedPeriod;
  /** 0..1. */
  percent: number;
}

/** Archetype G — remote-first, no attendance requirement at all. */
export interface NoQuotaScheme {
  kind: 'none';
}

export type SchemeParams =
  | BestOfWindowScheme
  | QualifyingWeeksScheme
  | WeeklyQuotaScheme
  | PeriodQuotaScheme
  | PeriodPercentageScheme
  | NoQuotaScheme;

export type SchemeKind = SchemeParams['kind'];

export const SCHEME_KINDS: readonly SchemeKind[] = [
  'best-of-window',
  'qualifying-weeks',
  'weekly-quota',
  'period-quota',
  'period-percentage',
  'none',
];

/** A complete, evaluable rule: the kind-specific parameters plus bands and absence handling. */
export type ComplianceScheme = SchemeParams & {
  bands: Bands;
  absence: AbsencePolicy;
};

export const SCHEME_LABEL: Record<SchemeKind, string> = {
  'best-of-window': 'Best weeks in a rolling window',
  'qualifying-weeks': 'Qualifying weeks in a rolling window',
  'weekly-quota': 'Days per week',
  'period-quota': 'Days per period',
  'period-percentage': 'Share of working days',
  none: 'No office requirement',
};

// --- evaluation results ---

/** One accumulation bucket — a week, month or quarter, depending on the scheme. */
export interface PeriodScore {
  /** Inclusive ISO bounds of the bucket. */
  start: string;
  end: string;
  label: string;
  officeDays: number;
  /** Days the employer expected attendance, after excused absences are removed. */
  scheduledDays: number;
  excusedDays: number;
  /** Office days this bucket needed, after proration. */
  requiredDays: number;
  /** This bucket alone, `0..1`. */
  attainment: number | null;
  /** The scheme's rolling score evaluated as of this bucket, `0..1`. Drives the sparkline. */
  score: number | null;
}

export interface ComplianceResult {
  /** Headline attainment to date, `0..1`, or null while there is not yet enough history. */
  current: number | null;
  /** Attainment at the end of the forecast horizon if the current plan holds. */
  projected: number | null;
  band: Band | null;
  target: number;
  /** The bucket the scheme accumulates into — labels the sparkline and the planner copy. */
  unit: SchemePeriod;
  /** Trailing buckets, oldest to newest. */
  series: PeriodScore[];
  /** Short scheme-specific summary, e.g. "2 of 3 days this week". */
  headline: string;
}

// --- org presets ---

/**
 * How well sourced a preset is. Most employers never publish their measurement window, so most
 * presets are `reported` at best; the UI must show this rather than implying certainty.
 */
export type PolicyConfidence = 'official' | 'reported' | 'community';

export interface PolicySource {
  label: string;
  url: string;
}

export interface OrgPreset {
  /** URL segment and `cfg|org` value: lowercase, `a-z0-9-`. */
  id: string;
  label: string;
  /** Extra URL segments that resolve to this preset (e.g. `msft` → `microsoft`). */
  aliases?: readonly string[];
  /** One line for the picker, e.g. "3 days a week, measured each week". */
  summary: string;
  scheme: ComplianceScheme;
  /** Default target attainment, `0..1`. */
  target: number;
  /** Default holiday set id. */
  holidaySet: string;
  /** Default "usual week" pattern seeded on first run. */
  pattern?: Partial<Record<Weekday, Status>>;
  confidence: PolicyConfidence;
  /** Every parameter that is a modelling assumption rather than a sourced fact. */
  assumptions?: readonly string[];
  sources: readonly PolicySource[];
  /** ISO date the policy took effect, when known. */
  effectiveDate?: string;
  /** e.g. "Within 50 miles of an office". */
  geographicScope?: string;
  notes?: string;
}

// --- defaults ---

export const DEFAULT_BANDS: Bands = { warn: 0.8, success: 0.9 };

/** Time off, sickness, holidays and "other" are excused; business travel is not office time. */
export const DEFAULT_ABSENCE: AbsencePolicy = {
  excused: ['vacation', 'sick', 'holiday', 'oof'],
  travelCountsAsOffice: false,
  proration: 'prorate',
};

/** Microsoft BELT — best 8 of the last 12 weeks, ÷5, with the window itself as the time-off grace. */
export const BELT_SCHEME: ComplianceScheme = {
  kind: 'best-of-window',
  windowWeeks: 12,
  bestCount: 8,
  weeklyCap: 5,
  bands: DEFAULT_BANDS,
  absence: { ...DEFAULT_ABSENCE, proration: 'ignore' },
};

export function bandOf(value: number, bands: Bands = DEFAULT_BANDS): Band {
  if (value < bands.warn) return 'danger';
  if (value < bands.success) return 'warning';
  return 'success';
}

/** A sensible starting shape when a user switches scheme kind in Settings. */
export function defaultSchemeFor(kind: SchemeKind, base?: ComplianceScheme): ComplianceScheme {
  const bands = base?.bands ?? DEFAULT_BANDS;
  const absence = base?.absence ?? DEFAULT_ABSENCE;
  switch (kind) {
    case 'best-of-window':
      return { ...BELT_SCHEME, bands, absence };
    case 'qualifying-weeks':
      return { kind, windowWeeks: 12, minQualifying: 8, daysPerWeek: 3, bands, absence };
    case 'weekly-quota':
      return { kind, daysPerWeek: 3, averagingWeeks: 1, bands, absence };
    case 'period-quota':
      return { kind, period: 'quarter', days: 10, bands, absence };
    case 'period-percentage':
      return { kind, period: 'month', percent: 0.5, bands, absence };
    case 'none':
      return { kind, bands, absence };
  }
}

/** The accumulation bucket a scheme reports in. */
export function schemePeriod(scheme: SchemeParams): SchemePeriod {
  if (scheme.kind === 'period-quota' || scheme.kind === 'period-percentage') return scheme.period;
  return 'week';
}

/** Most office days a single week can contribute — the planner's upper search bound. */
export function schemeWeeklyCap(scheme: SchemeParams): number {
  return scheme.kind === 'best-of-window' ? scheme.weeklyCap : 7;
}

// --- validation (the CRDT stores a customized scheme as a plain JSON cell) ---

function isBands(value: unknown): value is Bands {
  const b = value as Partial<Bands> | null;
  return (
    typeof b === 'object' &&
    b !== null &&
    typeof b.warn === 'number' &&
    typeof b.success === 'number' &&
    b.warn >= 0 &&
    b.success <= 1 &&
    b.warn <= b.success
  );
}

function isAbsencePolicy(value: unknown): value is AbsencePolicy {
  const a = value as Partial<AbsencePolicy> | null;
  return (
    typeof a === 'object' &&
    a !== null &&
    Array.isArray(a.excused) &&
    a.excused.every((s) => typeof s === 'string') &&
    typeof a.travelCountsAsOffice === 'boolean' &&
    (a.proration === 'prorate' || a.proration === 'ignore')
  );
}

const positiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

function isSchemeParams(value: unknown): value is SchemeParams {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as { kind?: unknown } & Record<string, unknown>;
  switch (s.kind) {
    case 'best-of-window':
      return (
        positiveInt(s.windowWeeks) &&
        positiveInt(s.bestCount) &&
        positiveInt(s.weeklyCap) &&
        s.bestCount <= s.windowWeeks
      );
    case 'qualifying-weeks':
      return (
        positiveInt(s.windowWeeks) &&
        positiveInt(s.minQualifying) &&
        positiveInt(s.daysPerWeek) &&
        s.minQualifying <= s.windowWeeks
      );
    case 'weekly-quota':
      return (
        typeof s.daysPerWeek === 'number' &&
        s.daysPerWeek >= 0 &&
        s.daysPerWeek <= 7 &&
        positiveInt(s.averagingWeeks)
      );
    case 'period-quota':
      return (s.period === 'month' || s.period === 'quarter') && positiveInt(s.days);
    case 'period-percentage':
      return (
        (s.period === 'month' || s.period === 'quarter') &&
        typeof s.percent === 'number' &&
        s.percent >= 0 &&
        s.percent <= 1
      );
    case 'none':
      return true;
    default:
      return false;
  }
}

export function isComplianceScheme(value: unknown): value is ComplianceScheme {
  if (!isSchemeParams(value)) return false;
  const s = value as ComplianceScheme;
  return isBands(s.bands) && isAbsencePolicy(s.absence);
}

/** Parse a `cfg|scheme` cell, falling back to `null` for anything malformed. */
export function parseScheme(value: unknown): ComplianceScheme | null {
  if (typeof value === 'string') {
    try {
      return parseScheme(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  return isComplianceScheme(value) ? value : null;
}
