/** Presentation helpers (formatting). Pure; no app state. */

export function parseWeek(weekStart: string): Date {
  return new Date(`${weekStart}T00:00:00Z`);
}

const dayMonth = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "5 Jan" — mirrors the template's d-mmm week label. */
export function formatWeekLabel(weekStart: string): string {
  return dayMonth.format(parseWeek(weekStart));
}

/** "5–9 Jan" Mon–Fri span for a week starting on `weekStart`. */
export function formatWeekRange(weekStart: string): string {
  const mon = parseWeek(weekStart);
  const fri = new Date(mon.getTime() + 4 * 86_400_000);
  const sameMonth = mon.getUTCMonth() === fri.getUTCMonth();
  const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
  if (sameMonth) {
    return `${mon.getUTCDate()}–${fri.getUTCDate()} ${monthShort.format(fri)}`;
  }
  return `${formatWeekLabel(weekStart)} – ${dayMonth.format(fri)}`;
}

/** Integer percent like the template's `0%` format; em-dash when null. */
export function formatPct(belt: number | null | undefined): string {
  return belt == null ? '—' : `${Math.round(belt * 100)}%`;
}

/** Percent with no rounding surprises for axis labels. */
export function pctLabel(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
