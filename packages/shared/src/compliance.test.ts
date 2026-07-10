import { describe, expect, it } from 'vitest';
import { trailingWeekStarts } from './calendar.js';
import { beltForWeek, compliance, officeDaysByWeek } from './compliance.js';
import { dateKey, emptyDoc, patternKey, setCell } from './sync/doc.js';

const TODAY = '2026-06-17'; // a Wednesday

describe('compliance', () => {
  it('default (office) is fully compliant; series has the trailing weeks', () => {
    const c = compliance(emptyDoc(), 0.8, TODAY);
    expect(c.current).toBeCloseTo(1, 10);
    expect(c.projected).toBeCloseTo(1, 10);
    expect(c.band).toBe('success');
    expect(c.series.length).toBe(16);
  });
  it('an all-remote usual week drops current BELT to 0', () => {
    const d = emptyDoc();
    for (let wd = 1; wd <= 5; wd++)
      setCell(d, patternKey(wd as 1 | 2 | 3 | 4 | 5), 'remote', [1, 0]);
    const c = compliance(d, 0.8, TODAY);
    expect(c.current).toBeCloseTo(0, 10);
    expect(c.band).toBe('danger');
  });
  it('officeDaysByWeek counts a Sunday-start week', () => {
    const office = officeDaysByWeek(emptyDoc(), trailingWeekStarts('2026-06-14', 1), TODAY);
    expect(office[0]).toBe(5);
    expect(beltForWeek(emptyDoc(), '2026-06-14', TODAY)).toBeCloseTo(1, 10);
  });
  it('weekend office days substitute for remote weekdays', () => {
    const d = emptyDoc();
    for (let wd = 1; wd <= 5; wd++)
      setCell(d, patternKey(wd as 1 | 2 | 3 | 4 | 5), 'remote', [1, 0]);
    setCell(d, dateKey('2026-06-14'), 'office', [2, 0]);
    setCell(d, dateKey('2026-06-20'), 'office', [2, 1]);
    expect(officeDaysByWeek(d, ['2026-06-14'], TODAY)).toEqual([2]);
  });
  it('caps a seven-office-day week at five', () => {
    const d = emptyDoc();
    setCell(d, dateKey('2026-06-14'), 'office', [1, 0]);
    setCell(d, dateKey('2026-06-20'), 'office', [1, 1]);
    expect(officeDaysByWeek(d, ['2026-06-14'], TODAY)).toEqual([5]);
  });
});
