import { describe, expect, it } from 'vitest';
import { emptyDoc, patternKey, setCell } from '../sync/doc.js';
import type { Weekday } from '../types.js';
import { planOfficeDays } from './planner.js';
import { BELT_SCHEME, type ComplianceScheme, DEFAULT_ABSENCE, DEFAULT_BANDS } from './types.js';

const TODAY = '2026-06-15';

function allRemoteDoc() {
  const doc = emptyDoc();
  for (let weekday = 1; weekday <= 5; weekday++) {
    setCell(doc, patternKey(weekday as Weekday), 'remote', [weekday, 0]);
  }
  return doc;
}

describe('policy planOfficeDays', () => {
  it('plans BELT with the generic best-of-window scheme', () => {
    const result = planOfficeDays(allRemoteDoc(), BELT_SCHEME, TODAY, 8, 0.8, false);
    expect(result.achievable).toBe(true);
    expect(result.requiredPerWeek).toBe(4);
  });

  it('returns zero office days for no-requirement schemes', () => {
    const scheme: ComplianceScheme = {
      kind: 'none',
      bands: DEFAULT_BANDS,
      absence: DEFAULT_ABSENCE,
    };
    const result = planOfficeDays(emptyDoc(), scheme, TODAY, 4, 0.8);
    expect(result.requiredPerWeek).toBe(0);
    expect(result.projected).toEqual([1, 1, 1, 1]);
    expect(result.achievable).toBe(true);
  });
});
