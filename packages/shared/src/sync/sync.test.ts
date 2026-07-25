import { beforeEach, describe, expect, it } from 'vitest';
import { beltForWeek } from '../compliance.js';
import {
  CFG_HOLIDAY_REGION,
  cellValueEqual,
  type Doc,
  dateKey,
  emptyDoc,
  getHolidayRegion,
  getNotes,
  getPattern,
  holidayKey,
  holidayLabel,
  isCalendarNote,
  isHolidayOverride,
  isMeetupOverride,
  meetupKey,
  merge,
  migrate,
  noteKey,
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
    expect(resolveDay(d, '2027-07-05', undefined, '2027-07-01').status).toBe('holiday');
  });

  it('the usual-week pattern fills unmarked days, including weekends', () => {
    const d = emptyDoc();
    setCell(d, patternKey(2), 'remote', [1, 0]); // Tuesdays remote
    setCell(d, patternKey(6), 'office', [1, 1]); // Saturdays office
    expect(getPattern(d)[2]).toBe('remote');
    expect(resolveDay(d, '2026-02-03', undefined, '2026-02-01').status).toBe('remote');
    expect(resolveDay(d, '2026-02-04', undefined, '2026-02-01').status).toBe('office'); // Wed unaffected
    expect(resolveDay(d, '2026-02-07', undefined, '2026-02-01').status).toBe('office');
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

describe('meetup defaults and overrides', () => {
  it('updates defaults while preserving explicit user choices', () => {
    const d = emptyDoc();
    expect(isMeetupOverride(d, '2026-09-20')).toBe(true);
    expect(isMeetupOverride(d, '2026-10-11')).toBe(false);
    expect(isMeetupOverride(d, '2027-04-11')).toBe(false);

    setCell(d, meetupKey('2026-09-20'), false, [1, 0]);
    setCell(d, meetupKey('2026-10-11'), true, [1, 1]);
    setCell(d, meetupKey('2027-04-11'), true, [1, 2]);

    expect(isMeetupOverride(d, '2026-09-20')).toBe(false);
    expect(isMeetupOverride(d, '2026-10-11')).toBe(true);
    expect(isMeetupOverride(d, '2027-04-11')).toBe(true);
  });

  describe('holiday region and overrides', () => {
    it('defaults to the Microsoft US region', () => {
      const d = emptyDoc();
      expect(getHolidayRegion(d)).toBe('us-microsoft');
      expect(isHolidayOverride(d, '2026-11-27')).toBe(true); // day after Thanksgiving
      expect(isHolidayOverride(d, '2026-06-19')).toBe(false); // Juneteenth
      expect(resolveDay(d, '2026-11-27', {}, '2026-01-01').status).toBe('holiday');
    });

    it('switches defaults when the region changes', () => {
      const d = emptyDoc();
      setCell(d, CFG_HOLIDAY_REGION, 'us-federal', [1, 0]);
      expect(getHolidayRegion(d)).toBe('us-federal');
      expect(isHolidayOverride(d, '2026-06-19')).toBe(true);
      expect(isHolidayOverride(d, '2026-11-27')).toBe(false);
    });

    it('falls back to the default region for an unknown value', () => {
      const d = emptyDoc();
      setCell(d, CFG_HOLIDAY_REGION, 'atlantis', [1, 0]);
      expect(getHolidayRegion(d)).toBe('us-microsoft');
    });

    it('honours per-date add and remove overrides', () => {
      const d = emptyDoc();
      setCell(d, holidayKey('2026-11-27'), false, [1, 0]);
      setCell(d, holidayKey('2026-06-19'), true, [1, 1]);
      setCell(d, holidayKey('2026-10-31'), 'Halloween', [1, 2]);

      expect(isHolidayOverride(d, '2026-11-27')).toBe(false);
      expect(isHolidayOverride(d, '2026-06-19')).toBe(true);
      expect(isHolidayOverride(d, '2026-10-31')).toBe(true);
      expect(holidayLabel(d, '2026-11-27')).toBeNull();
      expect(holidayLabel(d, '2026-10-31')).toBe('Halloween');
      expect(holidayLabel(d, '2026-12-25')).toBe('Christmas Day');
      expect(holidayLabel(d, '2026-03-02')).toBeNull();
      expect(resolveDay(d, '2026-11-27', {}, '2026-01-01').status).toBe('office');
    });

    it('merges holiday cells commutatively and idempotently', () => {
      const a = emptyDoc();
      setCell(a, holidayKey('2026-10-31'), 'Halloween', [2, 0]);
      setCell(a, CFG_HOLIDAY_REGION, 'uk', [2, 0]);
      const b = emptyDoc();
      setCell(b, holidayKey('2026-10-31'), false, [1, 0]);
      setCell(b, CFG_HOLIDAY_REGION, 'ca', [3, 0]);

      const ab = merge(structuredClone(a), b);
      const ba = merge(structuredClone(b), a);
      expect(ab).toEqual(ba);
      expect(ab).toEqual(merge(structuredClone(ab), ab));
      expect(holidayLabel(ab, '2026-10-31')).toBe('Halloween'); // newer stamp wins
      expect(getHolidayRegion(ab)).toBe('ca');
    });
  });

  describe('calendar notes', () => {
    const note = {
      id: 'planning',
      start: '2026-07-10',
      end: '2026-07-20',
      label: 'Launch planning',
      color: '#7c3aed',
    };

    it('validates note records and reads intersecting ranges in deterministic order', () => {
      const d = emptyDoc();
      setCell(d, noteKey(note.id), note, [1, 0]);
      setCell(
        d,
        noteKey('earlier'),
        { ...note, id: 'earlier', start: '2026-07-01', end: '2026-07-02' },
        [1, 1],
      );
      setCell(d, noteKey('bad'), { ...note, id: 'wrong', color: 'purple' } as never, [1, 2]);

      expect(isCalendarNote(note)).toBe(true);
      expect(isCalendarNote({ ...note, start: '2026-02-30' })).toBe(false);
      expect(cellValueEqual(note, JSON.parse(JSON.stringify(note)))).toBe(true);
      expect(getNotes(d).map((item) => item.id)).toEqual(['earlier', 'planning']);
      expect(getNotes(d, '2026-07-15', '2026-07-31')).toEqual([note]);
    });

    it('merges edits and tombstone deletions by LWW without affecting BELT', () => {
      const original = emptyDoc();
      setCell(original, noteKey(note.id), note, [10, 0]);
      const edited = emptyDoc();
      setCell(edited, noteKey(note.id), { ...note, label: 'Updated' }, [20, 0]);
      const deleted = emptyDoc();
      setCell(deleted, noteKey(note.id), null, [30, 0]);
      const beforeBelt = beltForWeek(original, '2026-07-19', '2026-07-16');

      expect(getNotes(merge(original, edited))[0].label).toBe('Updated');
      expect(getNotes(merge(edited, deleted))).toEqual([]);
      expect(merge(deleted, edited)).toEqual(merge(edited, deleted));
      expect(beltForWeek(merge(original, edited), '2026-07-19', '2026-07-16')).toBe(beforeBelt);
    });
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
        'm|2026-03-08': { v: true, t: [1, 0] },
        'm|2026-03-09': { v: false, t: [2, 0] },
        [noteKey('preserved')]: {
          v: {
            id: 'preserved',
            start: '2026-03-01',
            end: '2027-03-01',
            label: 'Long range',
            color: '#123abc',
          },
          t: [3, 0],
        },
      },
    };
    const m = migrate(legacy);
    expect(m.cells[dateKey('2026-01-05')].v).toBe('office');
    expect(m.cells[dateKey('2026-01-19')].v).toBe('holiday');
    expect(m.cells[dateKey('2026-01-07')].v).toBe('vacation'); // tue of week 2026-01-06
    expect(m.cells['y|2026']).toBeUndefined();
    expect(m.cells['cfg|activeYear']).toBeUndefined();
    expect(m.cells['cfg|targetBelt'].v).toBe(0.9); // preserved
    expect(m.cells[meetupKey('2026-03-08')].v).toBe(false); // newer Monday key wins
    expect(m.cells[meetupKey('2026-03-09')]).toBeUndefined();
    expect(getNotes(m)[0].id).toBe('preserved');
    expect(migrate(m)).toBe(m); // Sunday-key migration is idempotent
  });
});
