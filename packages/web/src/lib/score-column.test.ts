import { BELT_SCHEME, defaultSchemeFor, type ComplianceScheme } from '@badgy/shared';
import { describe, expect, it } from 'vitest';
import { scoreColumnPresentation } from './score-column.js';

function scheme<K extends ComplianceScheme['kind']>(
  kind: K,
): Extract<ComplianceScheme, { kind: K }> {
  return defaultSchemeFor(kind) as Extract<ComplianceScheme, { kind: K }>;
}

describe('scoreColumnPresentation', () => {
  it('labels trailing-window policies as rolling scores', () => {
    expect(scoreColumnPresentation(BELT_SCHEME)).toEqual({
      label: 'Rolling Score',
      showPercentage: true,
    });
    expect(scoreColumnPresentation(scheme('qualifying-weeks'))).toEqual({
      label: 'Rolling Score',
      showPercentage: true,
    });
  });

  it('distinguishes weekly quotas from rolling averages', () => {
    const weekly = scheme('weekly-quota');
    expect(scoreColumnPresentation(weekly).label).toBe('Weekly Score');
    expect(scoreColumnPresentation({ ...weekly, averagingWeeks: 4 }).label).toBe('Rolling Score');
  });

  it.each([
    ['period-quota', 'month', 'Monthly Score'],
    ['period-quota', 'quarter', 'Quarterly Score'],
    ['period-percentage', 'month', 'Monthly Score'],
    ['period-percentage', 'quarter', 'Quarterly Score'],
  ] as const)('labels %s policies by their %s period', (kind, period, label) => {
    expect(scoreColumnPresentation({ ...scheme(kind), period }).label).toBe(label);
  });

  it('uses an office-days-only presentation when there is no requirement', () => {
    expect(scoreColumnPresentation(scheme('none'))).toEqual({
      label: 'Office Days',
      showPercentage: false,
    });
  });
});
