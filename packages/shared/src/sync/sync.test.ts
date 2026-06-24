import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Doc,
  dateKey,
  emptyDoc,
  getPattern,
  merge,
  migrate,
  patternKey,
  resolveDay,
  setCell,
} from './doc.js';
import { compareStamp, Hlc } from './hlc.js';

describe('Hlc', () => {
  it('is strictly monotonic and stays ahead of observed stamps', () => {
    const h = new Hlc(() => 1000);
    const a = h.tick();
    const b = h.tick();
    expect(compareStamp(b, a)).toBeGreaterThan(0);
    h.observe([5000, 9]);
    expect(compareStamp(h.tick(), [5000, 9])).toBeGreaterThan(0);
  });
});

describe('merge — CRDT laws (per-date keys)', () => {
  let a: Doc;
  let b: Doc;
  beforeEach(() => {
    a = emptyDoc();
    b = emptyDoc();
    setCell(a, dateKey('2026-02-03'), 'remote', [10, 0]);
    setCell(a, dateKey('2026-02-04'), 'office', [10, 0]);
    setCell(b, dateKey('2026-02-05'), 'vacation', [20, 0]);
    setCell(b, dateKey('2026-02-04'), 'sick', [30, 0]); // newer → wins
  });
  it('idempotent + commutative', () => {
    expect(merge(a, a)).toEqual(a);
    expect(merge(a, b)).toEqual(merge(b, a));
  });
  it('keeps concurrent edits + resolves conflicts by stamp', () => {
    const m = merge(a, b);
    expect(m.cells[dateKey('2026-02-03')].v).toBe('remote');
    expect(m.cells[dateKey('2026-02-05')].v).toBe('vacation');
    expect(m.cells[dateKey('2026-02-04')].v).toBe('sick');
  });
});

describe('resolveDay — defaults, pattern, overrides, forecast flags', () => {
  it('weekday → office, weekend → none, holiday → holiday (empty doc)', () => {
    const d = emptyDoc();
    expect(resolveDay(d, '2026-02-03', undefined, '2026-02-01').status).toBe('office'); // Tue
    expect(resolveDay(d, '2026-02-07', undefined, '2026-02-01').status).toBe('none'); // Sat
    expect(resolveDay(d, '2026-01-19', undefined, '2026-01-01').status).toBe('holiday');
  });
  it('the usual-week pattern fills unmarked weekdays', () => {
    const d = emptyDoc();
    setCell(d, patternKey(2), 'remote', [1, 0]); // Tuesdays remote
    expect(getPattern(d)[2]).toBe('remote');
    expect(resolveDay(d, '2026-02-03', undefined, '2026-02-01').status).toBe('remote');
    expect(resolveDay(d, '2026-02-04', undefined, '2026-02-01').status).toBe('office'); // Wed unaffected
  });
  it('an explicit day override beats the pattern', () => {
    const d = emptyDoc();
    setCell(d, patternKey(2), 'remote', [1, 0]);
    setCell(d, dateKey('2026-02-03'), 'vacation', [2, 0]);
    const r = resolveDay(d, '2026-02-03', undefined, '2026-02-01');
    expect(r.status).toBe('vacation');
    expect(r.explicit).toBe(true);
  });
  it('flags past vs future relative to today', () => {
    const d = emptyDoc();
    expect(resolveDay(d, '2026-02-01', undefined, '2026-02-10').isPast).toBe(true);
    expect(resolveDay(d, '2026-02-20', undefined, '2026-02-10').isFuture).toBe(true);
    expect(resolveDay(d, '2026-02-10', undefined, '2026-02-10').isToday).toBe(true);
  });
});

describe('migrate — v1 weekly-grid → v2 per-date', () => {
  it('rewrites legacy keys + maps the taxonomy, drops removed keys', () => {
    const legacy: Doc = {
      v: 1,
      cells: {
        'd|2026|2026-01-05|mon': { v: 'Office', t: [1, 0] },
        'd|2026|2026-01-19|mon': { v: 'Holiday', t: [1, 0] },
        'd|2026|2026-01-06|tue': { v: 'DTO', t: [1, 0] },
        'y|2026': { v: true, t: [1, 0] },
        'cfg|activeYear': { v: 2026, t: [1, 0] },
        'cfg|targetBelt': { v: 0.9, t: [1, 0] },
      },
    };
    const m = migrate(legacy);
    expect(m.cells[dateKey('2026-01-05')].v).toBe('office');
    expect(m.cells[dateKey('2026-01-19')].v).toBe('holiday');
    expect(m.cells[dateKey('2026-01-07')].v).toBe('vacation'); // tue of week 2026-01-06
    expect(m.cells['y|2026']).toBeUndefined();
    expect(m.cells['cfg|activeYear']).toBeUndefined();
    expect(m.cells['cfg|targetBelt'].v).toBe(0.9); // preserved
  });
});
