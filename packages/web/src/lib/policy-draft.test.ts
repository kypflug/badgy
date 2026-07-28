import {
  BELT_SCHEME,
  type ComplianceResult,
  type ComplianceScheme,
  defaultSchemeFor,
  type OrgPreset,
  type PeriodScore,
} from '@badgy/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  buildEffectSeries,
  describeEffect,
  describeScheme,
  draftEqual,
  draftFromOrg,
  draftSchemeIsCustom,
  guardPolicyNavigation,
  type PolicyDraftValue,
} from './policy-draft.js';

/** BELT_SCHEME's own `kind` is known at runtime; narrow it so test-only spreads type-check. */
const belt = BELT_SCHEME as Extract<ComplianceScheme, { kind: 'best-of-window' }>;

const org: OrgPreset = {
  id: 'microsoft',
  label: 'Microsoft',
  summary: '3 days a week',
  scheme: BELT_SCHEME,
  target: 0.8,
  holidaySet: 'us-microsoft',
  confidence: 'official',
  sources: [],
};

function period(end: string, score: number | null): PeriodScore {
  return {
    start: end,
    end,
    label: end,
    officeDays: 0,
    scheduledDays: 0,
    excusedDays: 0,
    requiredDays: 0,
    attainment: score,
    score,
  };
}

function result(overrides: Partial<ComplianceResult> = {}): ComplianceResult {
  return {
    current: 0.6,
    projected: 0.6,
    band: 'warning',
    target: 0.8,
    unit: 'week',
    series: [period('2026-01-04', 0.5), period('2026-01-11', 0.6)],
    futureSeries: [period('2026-01-18', 0.62)],
    headline: '3 of 5 days this week',
    ...overrides,
  };
}

describe('draftFromOrg', () => {
  it('mirrors the preset org/scheme/target/holiday set', () => {
    expect(draftFromOrg(org)).toEqual({
      orgId: 'microsoft',
      scheme: BELT_SCHEME,
      target: 0.8,
      holidayRegion: 'us-microsoft',
    });
  });
});

describe('draftEqual', () => {
  const base: PolicyDraftValue = {
    orgId: 'microsoft',
    scheme: BELT_SCHEME,
    target: 0.8,
    holidayRegion: 'us-microsoft',
  };

  it('is true for structurally identical drafts, even distinct scheme objects', () => {
    expect(draftEqual(base, { ...base, scheme: { ...BELT_SCHEME } })).toBe(true);
  });

  it('is false when orgId differs', () => {
    expect(draftEqual(base, { ...base, orgId: 'amazon' })).toBe(false);
  });

  it('is false when target differs', () => {
    expect(draftEqual(base, { ...base, target: 0.9 })).toBe(false);
  });

  it('is false when holidayRegion differs', () => {
    expect(draftEqual(base, { ...base, holidayRegion: 'none' })).toBe(false);
  });

  it('is false when the scheme differs', () => {
    expect(draftEqual(base, { ...base, scheme: { ...belt, bestCount: 4 } })).toBe(false);
  });
});

describe('draftSchemeIsCustom', () => {
  it('is false when the scheme matches the org preset', () => {
    expect(draftSchemeIsCustom(BELT_SCHEME, org)).toBe(false);
  });
  it('is true once the scheme diverges', () => {
    expect(draftSchemeIsCustom({ ...belt, bestCount: 4 }, org)).toBe(true);
  });
});

describe('describeScheme', () => {
  it('describes best-of-window', () => {
    expect(describeScheme(BELT_SCHEME)).toBe(
      'Counts your best 8 of the last 12 weeks, capping each week at 5 office days.',
    );
  });
  it('describes qualifying-weeks', () => {
    const scheme = defaultSchemeFor('qualifying-weeks');
    expect(describeScheme(scheme)).toBe(
      'Needs 8 of the last 12 weeks to each hit 3 office days.',
    );
  });
  it('describes weekly-quota with no averaging', () => {
    const scheme = defaultSchemeFor('weekly-quota');
    expect(describeScheme(scheme)).toBe('Needs 3 office days every week.');
  });
  it('describes weekly-quota with averaging', () => {
    const scheme = { ...defaultSchemeFor('weekly-quota'), averagingWeeks: 4 } as const;
    expect(describeScheme(scheme)).toBe(
      'Needs 3 office days a week on average, over a 4-week rolling window.',
    );
  });
  it('describes period-quota', () => {
    const scheme = defaultSchemeFor('period-quota');
    expect(describeScheme(scheme)).toBe('Needs 10 office days a quarter.');
  });
  it('describes period-percentage', () => {
    const scheme = defaultSchemeFor('period-percentage');
    expect(describeScheme(scheme)).toBe('Needs 50% of working days a month in the office.');
  });
  it('describes none', () => {
    expect(describeScheme(defaultSchemeFor('none'))).toBe(
      'No office attendance requirement — your score always reads 100%.',
    );
  });
  it('singularizes day/week counts of 1', () => {
    const scheme = { ...defaultSchemeFor('weekly-quota'), daysPerWeek: 1 };
    expect(describeScheme(scheme)).toBe('Needs 1 office day every week.');
  });
});

describe('describeEffect', () => {
  it('reports an upward change with the new headline', () => {
    const baseline = result({ current: 0.5 });
    const draft = result({ current: 0.66 });
    expect(describeEffect(baseline, draft)).toBe(
      'Your score would go up 16 points — 3 of 5 days this week.',
    );
  });
  it('reports a downward change', () => {
    const baseline = result({ current: 0.8 });
    const draft = result({ current: 0.7 });
    expect(describeEffect(baseline, draft)).toBe(
      'Your score would go down 10 points — 3 of 5 days this week.',
    );
  });
  it('reports no change', () => {
    const baseline = result({ current: 0.6 });
    const draft = result({ current: 0.601 });
    expect(describeEffect(baseline, draft)).toBe(
      'Your score would stay about the same — 3 of 5 days this week.',
    );
  });
  it('falls back when there is not enough history yet', () => {
    const baseline = result({ current: null });
    const draft = result({ current: 0.5 });
    expect(describeEffect(baseline, draft)).toMatch(/Not enough attendance history/);
  });
});

describe('buildEffectSeries', () => {
  it('plots both series across the union of their domains', () => {
    const baseline = result();
    const draft = result();
    const series = buildEffectSeries(baseline, draft, 100, 50);
    expect(series.domainStart).toBe('2026-01-04');
    expect(series.domainEnd).toBe('2026-01-18');
    expect(series.oldPoints.split(' ')).toHaveLength(3);
    expect(series.newPoints.split(' ')).toHaveLength(3);
  });

  it('returns empty points when a result has no series at all', () => {
    const empty = result({ series: [], futureSeries: [] });
    const series = buildEffectSeries(empty, empty, 100, 50);
    expect(series).toEqual({ domainStart: '', domainEnd: '', oldPoints: '', newPoints: '' });
  });
});

describe('guardPolicyNavigation', () => {
  it('proceeds without prompting when the draft is not dirty', () => {
    const confirmDiscard = vi.fn(() => false);
    expect(guardPolicyNavigation(false, confirmDiscard)).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });
  it('proceeds when dirty and the user confirms discarding', () => {
    expect(guardPolicyNavigation(true, () => true)).toBe(true);
  });
  it('blocks when dirty and the user cancels', () => {
    expect(guardPolicyNavigation(true, () => false)).toBe(false);
  });
});
