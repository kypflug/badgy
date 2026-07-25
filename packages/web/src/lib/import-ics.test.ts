import { describe, expect, it } from 'vitest';
import { parseIcs } from './import-ics.js';

const wrap = (body: string): string =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');

const event = (lines: string[]): string => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');

describe('parseIcs', () => {
  it('reads an all-day event', () => {
    const { holidays } = parseIcs(
      wrap(event(['DTSTART;VALUE=DATE:20260704', 'SUMMARY:Independence Day'])),
    );
    expect(holidays).toEqual([{ date: '2026-07-04', name: 'Independence Day' }]);
  });

  it('treats an all-day DTEND as exclusive and expands the span', () => {
    const { holidays } = parseIcs(
      wrap(
        event(['DTSTART;VALUE=DATE:20261224', 'DTEND;VALUE=DATE:20261226', 'SUMMARY:Winter break']),
      ),
    );
    expect(holidays.map((h) => h.date)).toEqual(['2026-12-24', '2026-12-25']);
  });

  it('keeps a timed event on its start date', () => {
    const { holidays } = parseIcs(
      wrap(
        event(['DTSTART:20260519T090000Z', 'DTEND:20260519T170000Z', 'SUMMARY:Company offsite']),
      ),
    );
    expect(holidays).toEqual([{ date: '2026-05-19', name: 'Company offsite' }]);
  });

  it('unfolds continuation lines and unescapes text', () => {
    // RFC 5545 folding inserts CRLF + one space, so unfolding rejoins "mo" and "re".
    const { holidays } = parseIcs(
      wrap(
        [
          'BEGIN:VEVENT',
          'DTSTART;VALUE=DATE:20260101',
          'SUMMARY:New Year\\, and mo',
          ' re',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(holidays[0].name).toBe('New Year, and more');
  });

  it('ignores property parameters and non-event content', () => {
    const { holidays } = parseIcs(
      wrap(
        [
          'BEGIN:VTIMEZONE',
          'TZID:Europe/London',
          'END:VTIMEZONE',
          event(['DTSTART;VALUE=DATE:20260406', 'SUMMARY;LANGUAGE=en-GB:Easter Monday']),
        ].join('\r\n'),
      ),
    );
    expect(holidays).toEqual([{ date: '2026-04-06', name: 'Easter Monday' }]);
  });

  it('deduplicates dates, sorts them, and falls back to a default name', () => {
    const { holidays } = parseIcs(
      wrap(
        [
          event(['DTSTART;VALUE=DATE:20260501', 'SUMMARY:May Day']),
          event(['DTSTART;VALUE=DATE:20260101']),
          event(['DTSTART;VALUE=DATE:20260501', 'SUMMARY:Duplicate']),
        ].join('\r\n'),
      ),
    );
    expect(holidays).toEqual([
      { date: '2026-01-01', name: 'Holiday' },
      { date: '2026-05-01', name: 'May Day' },
    ]);
  });

  it('counts events it cannot date instead of failing', () => {
    const { holidays, skipped } = parseIcs(
      wrap(
        [
          event(['SUMMARY:No date here']),
          event(['DTSTART;VALUE=DATE:20260101', 'SUMMARY:New Year']),
        ].join('\r\n'),
      ),
    );
    expect(skipped).toBe(1);
    expect(holidays).toHaveLength(1);
  });

  it('caps a runaway multi-day span', () => {
    const { holidays } = parseIcs(
      wrap(
        event(['DTSTART;VALUE=DATE:20260101', 'DTEND;VALUE=DATE:20270101', 'SUMMARY:Sabbatical']),
      ),
    );
    expect(holidays).toHaveLength(32);
  });

  it('honours the event cap', () => {
    const body = Array.from({ length: 10 }, (_, i) =>
      event([`DTSTART;VALUE=DATE:2026010${(i % 9) + 1}`, `SUMMARY:Day ${i}`]),
    ).join('\r\n');
    expect(parseIcs(wrap(body), 3).holidays).toHaveLength(3);
  });

  it('rejects files that are not iCalendar', () => {
    expect(() => parseIcs('date,name\n2026-01-01,New Year')).toThrow(/not an icalendar/i);
  });

  it('rejects an iCalendar file with no dated events', () => {
    expect(() => parseIcs(wrap('PRODID:-//test//EN'))).toThrow(/no dated events/i);
  });
});
