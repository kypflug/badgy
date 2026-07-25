/**
 * Minimal iCalendar (RFC 5545) reader for holiday imports.
 *
 * Deliberately narrow: it takes the `DTSTART`/`DTEND`/`SUMMARY` of each `VEVENT` and expands
 * all-day and multi-day events into individual dates. Timed events are reduced to their start
 * date. `RRULE` is ignored — the holiday calendars exported by Google, Outlook and Apple list
 * each year as its own `VEVENT`.
 */
import type { Holiday } from '@badgy/shared';

const MS_PER_DAY = 86_400_000;
const DEFAULT_MAX_EVENTS = 2000;
const MAX_SPAN_DAYS = 31;

/** Undo RFC 5545 line folding: a CRLF followed by a space or tab continues the previous line. */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

/** Split `NAME;PARAM=x:value` into its name, parameters and value. */
function parseLine(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const semi = head.indexOf(';');
  return {
    name: (semi < 0 ? head : head.slice(0, semi)).trim().toUpperCase(),
    params: semi < 0 ? '' : head.slice(semi + 1).toUpperCase(),
    value: line.slice(colon + 1),
  };
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === 'n' || ch === 'N' ? ' ' : ch));
}

/** `YYYYMMDD` or `YYYYMMDDTHHMMSS[Z]` → an ISO date, or `null` when unparseable. */
function toISODate(value: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === `${y}-${m}-${d}` ? `${y}-${m}-${d}` : null;
}

function addDays(iso: string, n: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export interface ParsedIcs {
  holidays: Holiday[];
  /** Events that were found but could not be turned into dates, for user feedback. */
  skipped: number;
}

export function parseIcs(text: string, maxEvents = DEFAULT_MAX_EVENTS): ParsedIcs {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Not an iCalendar file.');

  const byDate = new Map<string, string>();
  let skipped = 0;
  let inEvent = false;
  let start: string | null = null;
  let end: string | null = null;
  let endIsExclusive = false;
  let summary = '';

  const flush = (): void => {
    if (!start) {
      skipped++;
      return;
    }
    const name = summary.trim() || 'Holiday';
    let last = start;
    if (end) {
      const exclusiveEnd = endIsExclusive ? addDays(end, -1) : end;
      if (exclusiveEnd > start) last = exclusiveEnd;
    }
    const span = Math.round(
      (new Date(`${last}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) /
        MS_PER_DAY,
    );
    if (span > MAX_SPAN_DAYS) last = addDays(start, MAX_SPAN_DAYS);
    for (let d = start; d <= last; d = addDays(d, 1)) if (!byDate.has(d)) byDate.set(d, name);
  };

  for (const line of unfold(text)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === 'BEGIN' && value.trim().toUpperCase() === 'VEVENT') {
      inEvent = true;
      start = null;
      end = null;
      endIsExclusive = false;
      summary = '';
      continue;
    }
    if (name === 'END' && value.trim().toUpperCase() === 'VEVENT') {
      if (inEvent) flush();
      inEvent = false;
      if (byDate.size >= maxEvents) break;
      continue;
    }
    if (!inEvent) continue;

    if (name === 'DTSTART') start = toISODate(value);
    else if (name === 'DTEND') {
      end = toISODate(value);
      // All-day DTEND is exclusive; a timed DTEND lands on the final day itself.
      endIsExclusive = params.includes('VALUE=DATE') || /^\d{8}$/.test(value.trim());
    } else if (name === 'SUMMARY') summary = unescapeText(value);
  }

  const holidays = [...byDate.entries()]
    .map(([date, holidayName]) => ({ date, name: holidayName }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, maxEvents);

  if (!holidays.length && !skipped) throw new Error('No dated events found in that file.');
  return { holidays, skipped };
}
