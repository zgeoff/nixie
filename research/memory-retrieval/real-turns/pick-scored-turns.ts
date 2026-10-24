import type { TurnCase } from './build-turn-cases.ts';
import type { Label } from './score-turns.ts';

// With labels, the labelled turns. With none, the rated turns and the turns whose retrieval returned
// an item, which show only the noise ratings and how many items each run shows.
export function pickScoredTurns(turns: TurnCase[], labels: Label[]): TurnCase[] {
  const labelled = new Set(labels.map((label) => label.caseID));

  return turns.filter((turn) =>
    labels.length > 0 ? labelled.has(turn.caseID) : turn.logged.length > 0 || turn.ratings.length > 0,
  );
}
