/** What-if planner: fewest office days/week over the next N weeks to reach/hold a target BELT. */
import { BELT_DIVISOR, BELT_WINDOW, beltOf } from './belt.js';
import { trailingWeekStarts, weekStartOf } from './calendar.js';
import { officeDaysByWeek } from './compliance.js';
import type { Doc } from './sync/doc.js';

export interface ProjectionResult {
  /** Min office days/week (0–5) that meets the goal, or null if even a full week can't. */
  requiredPerWeek: number | null;
  /** Projected BELT for each of the `horizon` future weeks at `requiredPerWeek`. */
  projected: (number | null)[];
  achievable: boolean;
}

function project(baseOffice: number[], horizon: number, perWeek: number): (number | null)[] {
  const series = [...baseOffice];
  const out: (number | null)[] = [];
  for (let w = 0; w < horizon; w++) {
    series.push(perWeek);
    out.push(beltOf(series.slice(series.length - BELT_WINDOW)));
  }
  return out;
}

function meetsGoal(projected: (number | null)[], target: number, hold: boolean): boolean {
  const scored = projected.filter((b): b is number => b !== null);
  if (scored.length === 0) return false;
  return hold
    ? scored.every((b) => b >= target - 1e-9)
    : scored[scored.length - 1] >= target - 1e-9;
}

export function requiredOfficeDays(
  doc: Doc,
  today: string,
  horizon: number,
  target: number,
  hold = true,
): ProjectionResult {
  const thisWeekStart = weekStartOf(today);
  const baseOffice = officeDaysByWeek(doc, trailingWeekStarts(thisWeekStart, BELT_WINDOW), today);
  for (let d = 0; d <= BELT_DIVISOR; d++) {
    const projected = project(baseOffice, horizon, d);
    if (meetsGoal(projected, target, hold)) {
      return { requiredPerWeek: d, projected, achievable: true };
    }
  }
  return {
    requiredPerWeek: null,
    projected: project(baseOffice, horizon, BELT_DIVISOR),
    achievable: false,
  };
}
