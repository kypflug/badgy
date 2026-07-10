import { describe, expect, it } from 'vitest';
import parity from './__fixtures__/belt-parity.json';
import { beltAt, beltBand, beltOf, beltSeries } from './belt.js';
import { officeDaysByWeek } from './compliance.js';
import { emptyDoc } from './sync/doc.js';

function expectClose(actual: (number | null)[], expected: (number | null)[]): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    if (e === null) expect(actual[i]).toBeNull();
    else expect(actual[i]).toBeCloseTo(e, 10);
  }
}

describe('beltOf / beltAt', () => {
  it('averages the best 8 of a window ÷5', () => {
    expect(beltOf([5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0])).toBeCloseTo(1, 10);
    expect(beltOf([3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 5])).toBeCloseTo(0.8, 10);
    expect(beltOf([])).toBeNull();
  });
  it('beltAt is null before the 13th week, then defined (Excel parity)', () => {
    const seq = Array<number>(13).fill(5);
    for (let i = 0; i < 12; i++) expect(beltAt(seq, i)).toBeNull();
    expect(beltAt(seq, 12)).toBeCloseTo(1, 10);
  });
});

describe('beltBand', () => {
  it('maps at 80% and 90%', () => {
    expect(beltBand(0.79)).toBe('danger');
    expect(beltBand(0.8)).toBe('warning');
    expect(beltBand(0.9)).toBe('success');
  });
});

describe('parity — independent oracle', () => {
  for (const s of parity.scenarios) {
    it(`matches oracle: ${s.name}`, () => expectClose(beltSeries(s.officeDays), s.expectedBelt));
  }
});

describe('Sunday-anchored per-date integration', () => {
  it('groups holidays into the containing Sunday-start week', () => {
    const office = officeDaysByWeek(emptyDoc(), ['2026-01-11', '2026-01-18'], '2026-01-01');
    expect(office).toEqual([5, 4]); // MLK Day is Monday Jan 19
  });
});
