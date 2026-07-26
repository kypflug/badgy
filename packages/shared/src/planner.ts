/** What-if planner: fewest office days/week over the next N weeks to reach/hold a target BELT. */
import { type ProjectionResult, planOfficeDays } from './policy/planner.js';
import { BELT_SCHEME } from './policy/types.js';
import type { Doc } from './sync/doc.js';

export type { ProjectionResult };

export function requiredOfficeDays(
  doc: Doc,
  today: string,
  horizon: number,
  target: number,
  hold = true,
): ProjectionResult {
  return planOfficeDays(doc, BELT_SCHEME, today, horizon, target, hold);
}
