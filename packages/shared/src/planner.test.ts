import { describe, expect, it } from 'vitest';
import { beltAt } from './belt.js';
import { projectBelt, requiredOfficeDays } from './planner.js';

describe('projectBelt', () => {
  it('equals beltAt on the explicitly extended sequence', () => {
    const base = Array<number>(15).fill(3);
    const horizon = 5;
    const perWeek = 5;
    const extended = [...base, ...Array<number>(horizon).fill(perWeek)];
    const projected = projectBelt(base, horizon, perWeek);
    for (let h = 0; h < horizon; h++) {
      expect(projected[h]).toBe(beltAt(extended, base.length + h));
    }
  });
});

describe('requiredOfficeDays', () => {
  it('returns 0 when banked history already holds the target', () => {
    const seq = Array<number>(20).fill(5);
    const r = requiredOfficeDays({ officeSeq: seq, horizon: 4, target: 0.8 });
    expect(r.achievable).toBe(true);
    expect(r.requiredPerWeek).toBe(0);
  });

  it('finds the minimal whole office days/week to reach the target by the end', () => {
    const seq = Array<number>(12).fill(3); // baseline BELT 0.6
    const target = 0.8;
    const r = requiredOfficeDays({ officeSeq: seq, horizon: 8, target, hold: false });
    expect(r.achievable).toBe(true);
    expect(r.requiredPerWeek).toBe(4);
    // one fewer day misses the target on the final week
    const worse = projectBelt(seq, 8, 3);
    expect(worse.at(-1)).toBeLessThan(target);
  });

  it('reports unachievable when even a full week cannot reach the target', () => {
    const seq = Array<number>(12).fill(0);
    const r = requiredOfficeDays({ officeSeq: seq, horizon: 1, target: 1, hold: true });
    expect(r.achievable).toBe(false);
    expect(r.requiredPerWeek).toBeNull();
  });
});
