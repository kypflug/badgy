import { describe, expect, it } from 'vitest';
import parity from '../__fixtures__/belt-parity.json';
import { beltSeries } from '../belt.js';
import { addDays, weekdayOf } from '../calendar.js';
import { compliance } from '../compliance.js';
import { type Doc, dateKey, emptyDoc, patternKey, setCell } from '../sync/doc.js';
import type { PickableStatus, Weekday } from '../types.js';
import { bestOfWindowSeries, evaluate, periodBoundsOf, weekScore } from './engine.js';
import { BELT_SCHEME, type ComplianceScheme, DEFAULT_ABSENCE, DEFAULT_BANDS } from './types.js';

const WEEK = '2026-03-01';
const TODAY = '2026-03-04';

function stamp(n: number): [number, number] {
  return [n, 0];
}

function setDate(doc: Doc, iso: string, status: PickableStatus): void {
  setCell(doc, dateKey(iso), status, stamp(Object.keys(doc.cells).length + 1));
}

function setWeekdays(doc: Doc, weekStart: string, statuses: readonly PickableStatus[]): void {
  for (let i = 0; i < statuses.length; i++) setDate(doc, addDays(weekStart, i + 1), statuses[i]);
}

function allRemoteDoc(): Doc {
  const doc = emptyDoc();
  for (let weekday = 1; weekday <= 5; weekday++) {
    setCell(doc, patternKey(weekday as Weekday), 'remote', stamp(weekday));
  }
  return doc;
}

function docFromWeeklyOffice(officeDays: readonly number[], firstWeek = '2026-03-01'): Doc {
  const doc = allRemoteDoc();
  for (let i = 0; i < officeDays.length; i++) {
    const weekStart = addDays(firstWeek, i * 7);
    for (let day = 1; day <= officeDays[i]; day++) setDate(doc, addDays(weekStart, day), 'office');
  }
  return doc;
}

function quotaScheme(proration: 'prorate' | 'ignore' = 'ignore'): ComplianceScheme {
  return {
    kind: 'weekly-quota',
    daysPerWeek: 3,
    averagingWeeks: 1,
    bands: DEFAULT_BANDS,
    absence: { ...DEFAULT_ABSENCE, proration },
  };
}

function expectCloseSeries(actual: (number | null)[], expected: (number | null)[]): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const value = expected[i];
    if (value === null) expect(actual[i]).toBeNull();
    else expect(actual[i]).toBeCloseTo(value, 10);
  }
}

describe('policy engine BELT parity', () => {
  for (const scenario of parity.scenarios) {
    it(`matches beltSeries for ${scenario.name}`, () => {
      expectCloseSeries(
        bestOfWindowSeries(scenario.officeDays, BELT_SCHEME),
        beltSeries(scenario.officeDays),
      );
    });
  }

  it('matches existing compliance wiring for current and projected BELT', () => {
    const docs = [emptyDoc(), allRemoteDoc(), emptyDoc()];
    for (let day = 0; day < 14; day++) setDate(docs[2], addDays('2026-06-22', day), 'vacation');

    for (const doc of docs) {
      const generic = evaluate(doc, BELT_SCHEME, 0.8, '2026-07-08');
      const legacy = compliance(doc, 0.8, '2026-07-08');
      expect(generic.current).toBeCloseTo(legacy.current ?? -1, 10);
      expect(generic.projected).toBeCloseTo(legacy.projected ?? -1, 10);
    }
  });
});

describe('policy engine weekly schemes', () => {
  it.each([
    BELT_SCHEME,
    {
      kind: 'qualifying-weeks',
      windowWeeks: 4,
      minQualifying: 3,
      daysPerWeek: 3,
      bands: DEFAULT_BANDS,
      absence: DEFAULT_ABSENCE,
    },
    quotaScheme(),
  ] satisfies ComplianceScheme[])('forecasts resolved weekly plans for $kind', (scheme) => {
    const result = evaluate(emptyDoc(), scheme, 0.8, TODAY, {
      horizonPeriods: 2,
      trailPeriods: 1,
    });

    expect(result.series).toHaveLength(1);
    expect(result.series[0].start).toBe('2026-03-01');
    expect(result.futureSeries.map(({ start, end }) => ({ start, end }))).toEqual([
      { start: '2026-03-08', end: '2026-03-14' },
      { start: '2026-03-15', end: '2026-03-21' },
    ]);
    expect(result.futureSeries.every((point) => point.score === 1)).toBe(true);
    expect(result.projected).toBe(result.futureSeries.at(-1)?.score);
  });

  it('uses planned future statuses instead of extending the trailing series', () => {
    const doc = allRemoteDoc();
    setWeekdays(doc, '2026-03-08', ['office', 'office', 'office', 'remote', 'remote']);
    const result = evaluate(doc, quotaScheme(), 0.8, TODAY, {
      horizonPeriods: 2,
      trailPeriods: 1,
    });

    expect(result.series.at(-1)?.start).toBe('2026-03-01');
    expect(result.futureSeries.map((point) => point.score)).toEqual([1, 0]);
  });

  it('scores a strict weekly quota', () => {
    const three = allRemoteDoc();
    setWeekdays(three, WEEK, ['office', 'office', 'office', 'remote', 'remote']);
    expect(evaluate(three, quotaScheme(), 0.8, TODAY).current).toBeCloseTo(1, 10);

    const two = allRemoteDoc();
    setWeekdays(two, WEEK, ['office', 'office', 'remote', 'remote', 'remote']);
    expect(evaluate(two, quotaScheme(), 0.8, TODAY).current).toBeCloseTo(2 / 3, 10);
  });

  it('prorates weekly vacation days', () => {
    const doc = allRemoteDoc();
    setWeekdays(doc, WEEK, ['office', 'office', 'vacation', 'vacation', 'vacation']);

    const prorated = evaluate(doc, quotaScheme('prorate'), 0.8, TODAY).series.at(-1);
    expect(prorated?.requiredDays).toBe(2);
    expect(prorated?.attainment).toBe(1);

    const ignored = evaluate(doc, quotaScheme('ignore'), 0.8, TODAY).series.at(-1);
    expect(ignored?.requiredDays).toBe(3);
    expect(ignored?.attainment).toBeCloseTo(2 / 3, 10);
  });

  it('treats a full vacation week as fully attained only under proration', () => {
    const doc = allRemoteDoc();
    setWeekdays(doc, WEEK, ['vacation', 'vacation', 'vacation', 'vacation', 'vacation']);

    expect(evaluate(doc, quotaScheme('prorate'), 0.8, TODAY).series.at(-1)?.requiredDays).toBe(0);
    expect(evaluate(doc, quotaScheme('prorate'), 0.8, TODAY).series.at(-1)?.attainment).toBe(1);
    expect(evaluate(doc, quotaScheme('ignore'), 0.8, TODAY).series.at(-1)?.attainment).toBe(0);
  });

  it('credits travel only when the scheme says so', () => {
    const doc = allRemoteDoc();
    setWeekdays(doc, WEEK, ['travel', 'travel', 'travel', 'remote', 'remote']);
    const noCredit = quotaScheme();
    const credit = { ...noCredit, absence: { ...noCredit.absence, travelCountsAsOffice: true } };

    expect(evaluate(doc, noCredit, 0.8, TODAY).current).toBe(0);
    expect(evaluate(doc, credit, 0.8, TODAY).current).toBe(1);
  });

  it('scores qualifying weeks over a rolling window', () => {
    const scheme: ComplianceScheme = {
      kind: 'qualifying-weeks',
      windowWeeks: 12,
      minQualifying: 8,
      daysPerWeek: 3,
      bands: DEFAULT_BANDS,
      absence: { ...DEFAULT_ABSENCE, proration: 'ignore' },
    };
    const firstWeek = '2026-01-04';
    const eight = docFromWeeklyOffice([3, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0], firstWeek);
    const four = docFromWeeklyOffice([3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0], firstWeek);
    const today = addDays(firstWeek, 11 * 7 + 3);

    expect(evaluate(eight, scheme, 0.8, today).current).toBe(1);
    expect(evaluate(four, scheme, 0.8, today).current).toBe(0.5);
  });
});

describe('policy engine fixed periods', () => {
  it('forecasts monthly and quarterly buckets after the current bucket', () => {
    const monthly: ComplianceScheme = {
      kind: 'period-quota',
      period: 'month',
      days: 10,
      bands: DEFAULT_BANDS,
      absence: DEFAULT_ABSENCE,
    };
    const quarterly: ComplianceScheme = {
      kind: 'period-percentage',
      period: 'quarter',
      percent: 0.5,
      bands: DEFAULT_BANDS,
      absence: DEFAULT_ABSENCE,
    };

    const monthResult = evaluate(emptyDoc(), monthly, 0.8, TODAY, {
      horizonPeriods: 2,
      trailPeriods: 1,
    });
    expect(
      monthResult.futureSeries.map(({ start, end, score }) => ({ start, end, score })),
    ).toEqual([
      { start: '2026-04-01', end: '2026-04-30', score: 1 },
      { start: '2026-05-01', end: '2026-05-31', score: 1 },
    ]);

    const quarterResult = evaluate(emptyDoc(), quarterly, 0.8, TODAY, {
      horizonPeriods: 1,
      trailPeriods: 1,
    });
    expect(quarterResult.series.at(-1)?.end).toBe('2026-03-31');
    expect(quarterResult.futureSeries).toMatchObject([
      { start: '2026-04-01', end: '2026-06-30', score: 1 },
    ]);
  });

  it('uses calendar quarter boundaries for period quotas', () => {
    const scheme: ComplianceScheme = {
      kind: 'period-quota',
      period: 'quarter',
      days: 10,
      bands: DEFAULT_BANDS,
      absence: { ...DEFAULT_ABSENCE, proration: 'ignore' },
    };
    expect(periodBoundsOf('2026-03-31', 'quarter')).toEqual({
      start: '2026-01-01',
      end: '2026-03-31',
    });
    expect(periodBoundsOf('2026-04-01', 'quarter')).toEqual({
      start: '2026-04-01',
      end: '2026-06-30',
    });

    const doc = docFromWeeklyOffice([5, 5], '2026-01-04');
    expect(evaluate(doc, scheme, 0.8, '2026-03-31').current).toBe(1);
    expect(evaluate(doc, scheme, 0.8, '2026-04-01').current).toBe(0);
  });

  it('scores a percentage of scheduled period days', () => {
    const scheme: ComplianceScheme = {
      kind: 'period-percentage',
      period: 'month',
      percent: 0.5,
      bands: DEFAULT_BANDS,
      absence: { ...DEFAULT_ABSENCE, proration: 'ignore' },
    };
    const doc = allRemoteDoc();
    for (let day = '2026-03-02', count = 0; count < 11; day = addDays(day, 1)) {
      if (![0, 6].includes(weekdayOf(day))) {
        setDate(doc, day, 'office');
        count++;
      }
    }
    expect(evaluate(doc, scheme, 0.8, '2026-03-31').series.at(-1)?.requiredDays).toBe(11);
    expect(evaluate(doc, scheme, 0.8, '2026-03-31').current).toBe(1);
  });

  it('has no score requirement for none schemes and empty docs', () => {
    const scheme: ComplianceScheme = {
      kind: 'none',
      bands: DEFAULT_BANDS,
      absence: DEFAULT_ABSENCE,
    };
    const result = evaluate(emptyDoc(), scheme, 0.8, '2026-03-31', { horizonPeriods: 1 });
    expect(result.current).toBe(1);
    expect(result.band).toBe('success');
    expect(result.futureSeries).toHaveLength(1);
    expect(result.futureSeries[0]).toMatchObject({
      start: '2026-04-05',
      end: '2026-04-11',
      attainment: 1,
      score: 1,
    });
    expect(() => weekScore(emptyDoc(), '2026-03-29', scheme, '2026-03-31')).not.toThrow();
  });
});
