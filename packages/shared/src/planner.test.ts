import { describe, expect, it } from 'vitest';
import { requiredOfficeDays } from './planner.js';
import { emptyDoc, patternKey, setCell } from './sync/doc.js';

const TODAY = '2026-06-15'; // a Monday mid-year

describe('requiredOfficeDays', () => {
  it('needs 0 when the default (office) already holds the target', () => {
    const r = requiredOfficeDays(emptyDoc(), TODAY, 4, 0.8, true);
    expect(r.achievable).toBe(true);
    expect(r.requiredPerWeek).toBe(0);
  });
  it('finds the minimal office days/week to reach a target by the end', () => {
    const d = emptyDoc();
    for (let wd = 1; wd <= 5; wd++)
      setCell(d, patternKey(wd as 1 | 2 | 3 | 4 | 5), 'remote', [1, 0]);
    const r = requiredOfficeDays(d, TODAY, 8, 0.8, false);
    expect(r.achievable).toBe(true);
    expect(r.requiredPerWeek).toBe(4);
  });
  it('reports unachievable when even a full week cannot reach the target', () => {
    const d = emptyDoc();
    for (let wd = 1; wd <= 5; wd++)
      setCell(d, patternKey(wd as 1 | 2 | 3 | 4 | 5), 'remote', [1, 0]);
    const r = requiredOfficeDays(d, TODAY, 1, 1, true);
    expect(r.achievable).toBe(false);
    expect(r.requiredPerWeek).toBeNull();
  });
});
