/** Small date helpers tied to "the current week". */

export function todayUTC(): number {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}

export function weekStartMs(weekStart: string): number {
  return new Date(`${weekStart}T00:00:00Z`).getTime();
}

/**
 * Index of the week containing today, or the last week if today is past the year,
 * or -1 if today is before the first week.
 */
export function currentWeekIndex(weekStarts: readonly string[]): number {
  if (weekStarts.length === 0) return -1;
  const t = todayUTC();
  const idx = weekStarts.findIndex((ws) => {
    const m = weekStartMs(ws);
    return t >= m && t < m + 7 * 86_400_000;
  });
  if (idx >= 0) return idx;
  if (t < weekStartMs(weekStarts[0])) return -1;
  return weekStarts.length - 1;
}

export function currentWeekStart(weekStarts: readonly string[]): string | undefined {
  const idx = currentWeekIndex(weekStarts);
  return idx >= 0 ? weekStarts[idx] : undefined;
}
