/**
 * What-if planning projector. Given the weeks tracked so far and a target BELT, work
 * out the fewest office days per week, over the next N weeks, needed to reach (or hold)
 * the target. Pure functions over Office-Day counts; reuses the canonical BELT logic.
 */
import { BELT_DIVISOR, beltAt } from './belt.js';

export interface ProjectionInput {
  /** Existing weekly Office-Day counts, ascending by date. */
  officeSeq: readonly number[];
  /** Number of future weeks to project. */
  horizon: number;
  /** Target BELT as a fraction (e.g. 0.8). */
  target: number;
  /**
   * `true` (default): meet the target in *every* projected week (hold compliance).
   * `false`: only need to meet it by the final projected week (reach).
   */
  hold?: boolean;
}

export interface ProjectionResult {
  /** Minimum office days/week (0–BELT_DIVISOR) that satisfies the goal, or null if even a full week can't. */
  requiredPerWeek: number | null;
  /** Projected BELT (fraction) for each of the `horizon` future weeks at `requiredPerWeek`. */
  projected: (number | null)[];
  /** Whether the target is achievable within the horizon. */
  achievable: boolean;
}

/** BELT for each future week if `perWeek` office days are logged for the next `horizon` weeks. */
export function projectBelt(
  officeSeq: readonly number[],
  horizon: number,
  perWeek: number,
): (number | null)[] {
  const extended = [...officeSeq, ...Array<number>(horizon).fill(perWeek)];
  const start = officeSeq.length;
  const out: (number | null)[] = [];
  for (let i = start; i < start + horizon; i++) out.push(beltAt(extended, i));
  return out;
}

function meetsGoal(projected: (number | null)[], target: number, hold: boolean): boolean {
  const scored = projected.filter((b): b is number => b !== null);
  if (scored.length === 0) return false;
  if (hold) return scored.every((b) => b >= target - 1e-9);
  return scored[scored.length - 1] >= target - 1e-9;
}

/**
 * Smallest whole office-days-per-week that reaches/holds the target across the horizon.
 * Office days are integers 0–5, so we search that small range directly.
 */
export function requiredOfficeDays(input: ProjectionInput): ProjectionResult {
  const { officeSeq, horizon, target, hold = true } = input;
  for (let d = 0; d <= BELT_DIVISOR; d++) {
    const projected = projectBelt(officeSeq, horizon, d);
    if (meetsGoal(projected, target, hold)) {
      return { requiredPerWeek: d, projected, achievable: true };
    }
  }
  // Not achievable: report the best case (a full week every week).
  return {
    requiredPerWeek: null,
    projected: projectBelt(officeSeq, horizon, BELT_DIVISOR),
    achievable: false,
  };
}
