import type { ComplianceScheme } from '@badgy/shared';

export interface ScoreColumnPresentation {
  label: 'Rolling Score' | 'Weekly Score' | 'Monthly Score' | 'Quarterly Score' | 'Office Days';
  showPercentage: boolean;
}

/** Calendar score-column copy and content mode for the active policy calculation. */
export function scoreColumnPresentation(scheme: ComplianceScheme): ScoreColumnPresentation {
  switch (scheme.kind) {
    case 'best-of-window':
    case 'qualifying-weeks':
      return { label: 'Rolling Score', showPercentage: true };
    case 'weekly-quota':
      return {
        label: scheme.averagingWeeks > 1 ? 'Rolling Score' : 'Weekly Score',
        showPercentage: true,
      };
    case 'period-quota':
    case 'period-percentage':
      return {
        label: scheme.period === 'month' ? 'Monthly Score' : 'Quarterly Score',
        showPercentage: true,
      };
    case 'none':
      return { label: 'Office Days', showPercentage: false };
  }
}
