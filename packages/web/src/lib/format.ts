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

/** "4–10 Jan" Sunday–Saturday span for a week starting on `weekStart`. */
export function formatWeekRange(weekStart: string): string {
  const start = parseWeek(weekStart);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
  if (sameMonth) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${monthShort.format(end)}`;
  }
  return `${formatWeekLabel(weekStart)} – ${dayMonth.format(end)}`;
}

/** Integer percent like the template's `0%` format; em-dash when null. */
export function formatPct(belt: number | null | undefined): string {
  return belt == null ? '—' : `${Math.round(belt * 100)}%`;
}

/** Percent with no rounding surprises for axis labels. */
export function pctLabel(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
