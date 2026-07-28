/** Pure presentation helpers with no app state. */

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

/** "12 days set · ⌘Z to undo" — the post-drag toast for a multi-day edit. */
export function rangeEditMessage(count: number, verb: 'set' | 'cleared', shortcut: string): string {
  return `${count} day${count === 1 ? '' : 's'} ${verb} · ${shortcut} to undo`;
}

/** "Kyle P" → "KP" — one or two uppercase initials for the account avatar. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const initial = (part: string): string => part.match(/[\p{L}\p{N}]/u)?.[0] ?? '';
  const first = initial(parts[0]);
  const last = parts.length > 1 ? initial(parts[parts.length - 1]) : '';
  return (first + last).toUpperCase();
}
