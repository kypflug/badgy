/** Calendar helpers: enumerate a year's Mon-anchored weeks; build a blank year. */
import { DEFAULT_STATUS, type Week, type WeekDays, type YearData } from './types.js';

const MS_PER_DAY = 86_400_000;

/**
 * MAI Meetup week starts (Monday ISO dates) per year. 2026 mirrors the Edge Cycle
 * calendar (`chatgpm/cycles.yaml` meet_week_start for C2–C6, plus C1 = 2026-01-12).
 * Extend as new Cycles are published; users can also edit meetup weeks per year in-app.
 */
export const MEETUP_WEEKS: Record<number, readonly string[]> = {
  2026: ['2026-01-12', '2026-03-09', '2026-05-11', '2026-07-13', '2026-09-21', '2026-11-16'],
};

/** ISO dates (yyyy-mm-dd) of every Monday that falls within `year`. */
export function mondaysOfYear(year: number): string[] {
  const jan1 = Date.UTC(year, 0, 1);
  const dow = new Date(jan1).getUTCDay(); // 0 Sun .. 6 Sat
  const offsetToMonday = (8 - dow) % 7; // 0 when Jan 1 is a Monday
  let t = jan1 + offsetToMonday * MS_PER_DAY;
  const out: string[] = [];
  while (new Date(t).getUTCFullYear() === year) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 7 * MS_PER_DAY;
  }
  return out;
}

function blankDays(): WeekDays {
  return {
    mon: DEFAULT_STATUS,
    tue: DEFAULT_STATUS,
    wed: DEFAULT_STATUS,
    thu: DEFAULT_STATUS,
    fri: DEFAULT_STATUS,
  };
}

/** A fresh year: every weekday `Planned`, meetup weeks flagged from the registry (or `meetupStarts`). */
export function blankYear(
  year: number,
  meetupStarts: readonly string[] = MEETUP_WEEKS[year] ?? [],
): YearData {
  const set = new Set(meetupStarts);
  const weeks: Week[] = mondaysOfYear(year).map((weekStart) => ({
    weekStart,
    days: blankDays(),
    meetup: set.has(weekStart),
  }));
  return { year, weeks };
}
