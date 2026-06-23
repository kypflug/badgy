import { describe, expect, it } from 'vitest';
import parity from './__fixtures__/belt-parity.json';
import golden from './__fixtures__/template-2026.json';
import {
  BELT_FIRST_INDEX,
  beltAt,
  beltBand,
  beltSeries,
  dtoDays,
  officeDays,
  totals,
} from './belt.js';
import { SEED_2026 } from './seed/2026.js';
import type { WeekDays } from './types.js';

const days = (...d: string[]): WeekDays =>
  ({ mon: d[0], tue: d[1], wed: d[2], thu: d[3], fri: d[4] }) as WeekDays;

function expectBeltSeriesClose(actual: (number | null)[], expected: (number | null)[]): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    if (e === null) expect(actual[i]).toBeNull();
    else expect(actual[i]).toBeCloseTo(e, 10);
  }
}

describe('officeDays / dtoDays', () => {
  it('counts Office and Planned as office days', () => {
    expect(officeDays(days('Office', 'Planned', 'Remote', 'DTO', 'Holiday'))).toBe(2);
    expect(officeDays(days('Office', 'Office', 'Office', 'Office', 'Office'))).toBe(5);
    expect(officeDays(days('Remote', 'Sick', 'Travel', 'Holiday', 'DTO'))).toBe(0);
  });

  it('counts only DTO for dtoDays', () => {
    expect(dtoDays(days('DTO', 'DTO', 'Planned', 'Office', 'Remote'))).toBe(2);
    expect(dtoDays(days('Planned', 'Planned', 'Planned', 'Planned', 'Planned'))).toBe(0);
  });
});

describe('beltAt — window + boundary', () => {
  it('is null until the 13th week, then defined', () => {
    const seq = Array<number>(13).fill(5);
    for (let i = 0; i < BELT_FIRST_INDEX; i++) expect(beltAt(seq, i)).toBeNull();
    expect(beltAt(seq, 12)).toBeCloseTo(1, 10);
  });

  it('averages the best 8 of the trailing 12, ÷5 (and excludes index 0 at i=12)', () => {
    // index 0 = 9 (must be ignored); window for i=12 is indices 1..12.
    const seq = [9, 3, 3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 5];
    // window = [3,3,3,3,3,3,3,3,5,5,5,5]; top8 = four 5s + four 3s = 32; 32/8/5 = 0.8
    expect(beltAt(seq, 12)).toBeCloseTo(0.8, 10);
  });
});

describe('beltBand', () => {
  it('maps to danger/warning/success at 80% and 90%', () => {
    expect(beltBand(0.79)).toBe('danger');
    expect(beltBand(0.8)).toBe('warning');
    expect(beltBand(0.89)).toBe('warning');
    expect(beltBand(0.9)).toBe('success');
    expect(beltBand(1)).toBe('success');
  });
});

describe('parity — independent oracle over varied sequences', () => {
  for (const scenario of parity.scenarios) {
    it(`matches oracle: ${scenario.name}`, () => {
      expectBeltSeriesClose(beltSeries(scenario.officeDays), scenario.expectedBelt);
    });
  }
});

describe('parity — Excel-authoritative 2026 default', () => {
  it('Office/DTO counts from the seed match Excel cached values', () => {
    SEED_2026.weeks.forEach((week, i) => {
      expect(officeDays(week.days)).toBe(golden.weeks[i].officeDays);
      expect(dtoDays(week.days)).toBe(golden.weeks[i].dtoDays);
    });
  });

  it('BELT series from the seed matches Excel cached BELT', () => {
    const office = SEED_2026.weeks.map((w) => officeDays(w.days));
    expectBeltSeriesClose(
      beltSeries(office),
      golden.weeks.map((w) => w.beltCached),
    );
  });

  it('totals match Excel SUBTOTAL (Office Days = 250, DTO = 0)', () => {
    expect(totals(SEED_2026.weeks)).toEqual({ officeDays: 250, dtoDays: 0 });
  });
});
