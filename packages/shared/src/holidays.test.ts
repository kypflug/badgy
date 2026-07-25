import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOLIDAY_REGION,
  easterSunday,
  HOLIDAY_REGIONS,
  holidayNameFor,
  holidaysForYear,
  holidaysInYear,
  isHolidayRegionId,
  isRegionHoliday,
} from './holidays.js';

const dates = (region: Parameters<typeof holidaysForYear>[0], year: number): string[] =>
  holidaysInYear(region, year).map((h) => h.date);

/**
 * The dates Badgy shipped as hardcoded tables before the rule engine existed. The
 * `us-microsoft` region must keep reproducing them exactly so existing synced documents
 * resolve identically.
 */
const LEGACY_MICROSOFT_DATES = [
  '2026-01-19',
  '2026-02-16',
  '2026-05-25',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-11-27',
  '2026-12-24',
  '2026-12-25',
  '2027-01-01',
  '2027-01-18',
  '2027-02-15',
  '2027-05-31',
  '2027-07-05',
  '2027-09-06',
  '2027-11-25',
  '2027-11-26',
  '2027-12-23',
  '2027-12-24',
  '2027-12-31',
];

describe('us-microsoft parity with the legacy tables', () => {
  it('observes every legacy date', () => {
    for (const date of LEGACY_MICROSOFT_DATES)
      expect(isRegionHoliday('us-microsoft', date), date).toBe(true);
  });

  it('adds only 2026-01-01, which the legacy 2026 table started too late to include', () => {
    const resolved = [...dates('us-microsoft', 2026), ...dates('us-microsoft', 2027)];
    const legacy = new Set(LEGACY_MICROSOFT_DATES);
    expect(resolved.filter((d) => !legacy.has(d))).toEqual(['2026-01-01']);
    expect(LEGACY_MICROSOFT_DATES.filter((d) => !resolved.includes(d))).toEqual([]);
  });

  it('keeps Christmas Eve adjacent to the observed Christmas Day', () => {
    // 2027: Christmas Day is a Saturday, observed Friday 24 Dec, so Eve moves to Thursday.
    const y2027 = holidaysInYear('us-microsoft', 2027);
    expect(y2027.find((h) => h.name === 'Christmas Day')?.date).toBe('2027-12-24');
    expect(y2027.find((h) => h.name === 'Christmas Eve')?.date).toBe('2027-12-23');
  });

  it('omits the federal days Microsoft does not observe', () => {
    expect(isRegionHoliday('us-microsoft', '2026-06-19')).toBe(false); // Juneteenth
    expect(isRegionHoliday('us-microsoft', '2026-10-12')).toBe(false); // Columbus Day
    expect(isRegionHoliday('us-microsoft', '2026-11-11')).toBe(false); // Veterans Day
  });
});

describe('observance shifting', () => {
  it('nearest-weekday moves Saturday back and Sunday forward', () => {
    expect(dates('us-federal', 2026)).toContain('2026-07-03'); // 4 Jul 2026 is a Saturday
    expect(dates('us-federal', 2027)).toContain('2027-07-05'); // 4 Jul 2027 is a Sunday
  });

  it('rolls a Saturday New Year back into the previous December', () => {
    expect(dates('us-federal', 2027)).toContain('2027-12-31'); // for 1 Jan 2028
    expect(isRegionHoliday('us-federal', '2028-01-01')).toBe(false);
  });

  it('next-weekday substitutes UK Christmas and Boxing Day onto distinct days', () => {
    // 25 Dec 2027 is a Saturday: substitutes are Monday 27th and Tuesday 28th.
    const uk = holidaysInYear('uk', 2027);
    expect(uk.find((h) => h.name === 'Christmas Day')?.date).toBe('2027-12-27');
    expect(uk.find((h) => h.name === 'Boxing Day')?.date).toBe('2027-12-28');
  });

  it('leaves German holidays on their calendar date', () => {
    expect(isRegionHoliday('de', '2027-05-01')).toBe(true); // a Saturday
  });
});

describe('easter-derived holidays', () => {
  it('computes Easter Sunday', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2030)).toBe('2030-04-21');
  });

  it('offsets Good Friday, Easter Monday, Ascension and Whit Monday', () => {
    const uk = holidaysInYear('uk', 2026);
    expect(uk.find((h) => h.name === 'Good Friday')?.date).toBe('2026-04-03');
    expect(uk.find((h) => h.name === 'Easter Monday')?.date).toBe('2026-04-06');
    const de = holidaysInYear('de', 2026);
    expect(de.find((h) => h.name === 'Christi Himmelfahrt')?.date).toBe('2026-05-14');
    expect(de.find((h) => h.name === 'Pfingstmontag')?.date).toBe('2026-05-25');
  });
});

describe('region coverage', () => {
  it('resolves the nth and last weekday rules', () => {
    expect(holidayNameFor('us-federal', '2026-01-19')).toBe('Martin Luther King Jr. Day');
    expect(holidayNameFor('us-federal', '2026-05-25')).toBe('Memorial Day');
    expect(holidayNameFor('uk', '2026-08-31')).toBe('Summer bank holiday');
  });

  it("resolves Canada's Victoria Day to the Monday on or before 24 May", () => {
    expect(holidayNameFor('ca', '2026-05-18')).toBe('Victoria Day');
    expect(holidayNameFor('ca', '2027-05-24')).toBe('Victoria Day');
  });

  it("resolves St Brigid's Day to 1 February only when it is a Friday", () => {
    expect(holidayNameFor('ie', '2026-02-02')).toBe("St Brigid's Day"); // 1 Feb is a Sunday
    expect(holidayNameFor('ie', '2030-02-01')).toBe("St Brigid's Day"); // 1 Feb is a Friday
  });

  it('gives every advertised region a non-empty, date-sorted, duplicate-free year', () => {
    for (const region of HOLIDAY_REGIONS) {
      const resolved = holidaysForYear(region.id, 2026);
      expect(resolved.length, region.id).toBeGreaterThan(0);
      expect(new Set(resolved.map((h) => h.date)).size, region.id).toBe(resolved.length);
      expect(
        [...resolved].map((h) => h.date),
        region.id,
      ).toEqual([...resolved].map((h) => h.date).sort());
    }
  });

  it('validates region ids', () => {
    expect(isHolidayRegionId(DEFAULT_HOLIDAY_REGION)).toBe(true);
    expect(isHolidayRegionId('us-microsoft')).toBe(true);
    expect(isHolidayRegionId('atlantis')).toBe(false);
    expect(isHolidayRegionId(undefined)).toBe(false);
  });
});
