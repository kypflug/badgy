import { beforeEach, describe, expect, it } from 'vitest';
import { officeDays } from '../belt.js';
import {
  CFG_TARGET,
  type Doc,
  dayKey,
  defaultStatus,
  emptyDoc,
  materialize,
  meetupKey,
  merge,
  setCell,
  yearKey,
} from './doc.js';
import { compareStamp, Hlc } from './hlc.js';

describe('Hlc', () => {
  it('produces strictly increasing stamps', () => {
    const hlc = new Hlc(() => 1000); // frozen wall clock → counter must advance
    const a = hlc.tick();
    const b = hlc.tick();
    const c = hlc.tick();
    expect(compareStamp(b, a)).toBeGreaterThan(0);
    expect(compareStamp(c, b)).toBeGreaterThan(0);
  });

  it('stays ahead of observed remote stamps (clock skew)', () => {
    const hlc = new Hlc(() => 1000);
    hlc.observe([5000, 7]); // remote clock far ahead
    const next = hlc.tick();
    expect(compareStamp(next, [5000, 7])).toBeGreaterThan(0);
  });
});

describe('merge — CRDT laws', () => {
  let a: Doc;
  let b: Doc;
  beforeEach(() => {
    a = emptyDoc();
    b = emptyDoc();
    setCell(a, 'k1', 'Office', [10, 0]);
    setCell(a, 'shared', 'Office', [10, 0]);
    setCell(b, 'k2', 'Remote', [20, 0]);
    setCell(b, 'shared', 'Remote', [30, 0]); // newer → should win
  });

  it('is idempotent', () => {
    expect(merge(a, a)).toEqual(a);
  });

  it('is commutative', () => {
    expect(merge(a, b)).toEqual(merge(b, a));
  });

  it('keeps concurrent edits to different keys', () => {
    const m = merge(a, b);
    expect(m.cells.k1.v).toBe('Office');
    expect(m.cells.k2.v).toBe('Remote');
  });

  it('resolves same-key conflicts by latest stamp', () => {
    const m = merge(a, b);
    expect(m.cells.shared.v).toBe('Remote'); // stamp [30,0] beats [10,0]
  });
});

describe('materialize — defaults from the 2026 template', () => {
  it('empty doc yields the full 2026 calendar with seed holidays + meetups', () => {
    const app = materialize(emptyDoc(), 2026);
    expect(app.years[2026].weeks.length).toBe(52);
    expect(app.settings.targetBelt).toBe(0.8);
    expect(app.settings.activeYear).toBe(2026);
    // 2026-01-19 (MLK) Monday is a Holiday in the template
    const mlk = app.years[2026].weeks.find((w) => w.weekStart === '2026-01-19');
    expect(mlk?.days.mon).toBe('Holiday');
    // 6 meetup weeks from the registry
    expect(app.years[2026].weeks.filter((w) => w.meetup).length).toBe(6);
    // office-day total still matches the Excel (250)
    const total = app.years[2026].weeks.reduce((n, w) => n + officeDays(w.days), 0);
    expect(total).toBe(250);
  });

  it('an override beats the default; default helper is consistent', () => {
    expect(defaultStatus(2026, '2026-01-19', 'mon')).toBe('Holiday');
    const doc = emptyDoc();
    setCell(doc, dayKey(2026, '2026-01-19', 'mon'), 'Office', [100, 0]);
    const app = materialize(doc, 2026);
    expect(app.years[2026].weeks.find((w) => w.weekStart === '2026-01-19')?.days.mon).toBe(
      'Office',
    );
  });

  it('surfaces an added year and a meetup override', () => {
    const doc = emptyDoc();
    setCell(doc, yearKey(2027), true, [1, 0]);
    setCell(doc, meetupKey(2027, mondayIn2027()), true, [1, 0]);
    const app = materialize(doc, 2026);
    expect(app.years[2027]).toBeDefined();
    expect(app.years[2027].weeks.filter((w) => w.meetup).length).toBe(1);
  });
});

describe('multi-device convergence', () => {
  it('two devices editing offline converge to the same state both ways', () => {
    // device A edits a Monday; device B edits a different Friday + the target.
    const base = emptyDoc();
    const A: Doc = structuredClone(base);
    const B: Doc = structuredClone(base);
    setCell(A, dayKey(2026, '2026-02-02', 'mon'), 'Office', [200, 0]);
    setCell(B, dayKey(2026, '2026-02-02', 'fri'), 'Remote', [210, 0]);
    setCell(B, CFG_TARGET, 0.9, [220, 0]);

    const ab = merge(A, B);
    const ba = merge(B, A);
    expect(ab).toEqual(ba);

    const app = materialize(ab, 2026);
    const wk = app.years[2026].weeks.find((w) => w.weekStart === '2026-02-02');
    expect(wk?.days.mon).toBe('Office'); // A's edit survives
    expect(wk?.days.fri).toBe('Remote'); // B's edit survives
    expect(app.settings.targetBelt).toBe(0.9);
  });
});

function mondayIn2027(): string {
  // 2027-01-04 is the first Monday of 2027.
  return '2027-01-04';
}
