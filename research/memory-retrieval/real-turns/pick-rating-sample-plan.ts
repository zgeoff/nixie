import type { TurnCase } from './build-turn-cases.ts';
import { pickPooledRuns } from './pick-pooled-runs.ts';
import { type RatingTurns, pickRatingTurns } from './pick-rating-turns.ts';
import type { Run } from './score-turns.ts';

export interface RatingSamplePlan {
  chosen: RatingTurns;
  runs: Run[];
}

// Picks the turns a rater marks and the settings whose rankings fill each turn's pool, before any
// ranking runs.
export function pickRatingSamplePlan(turns: TurnCase[], size: number, shortWords: number, runs: Run[]): RatingSamplePlan {
  return { chosen: pickRatingTurns(turns, size, shortWords), runs: pickPooledRuns(runs) };
}
