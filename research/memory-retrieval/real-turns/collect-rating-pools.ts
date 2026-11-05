import type { TurnCase } from './build-turn-cases.ts';
import type { RankedTurn, Run } from './score-turns.ts';

// Pools, for each turn, every item a compared setting would show and every item the turn logged.
// A ranking setting adds only its top places, because a rater reads each pooled item.
export function collectRatingPools(
  runs: Pick<Run, 'name' | 'kind'>[],
  results: ReadonlyMap<string, RankedTurn[]>,
  turns: Pick<TurnCase, 'caseID' | 'logged'>[],
  topPlaces: number,
): Map<string, string[]> {
  const pools = new Map<string, string[]>();
  const add = (caseID: string, itemIDs: string[]) => pools.set(caseID, [...new Set([...(pools.get(caseID) ?? []), ...itemIDs])]);

  for (const run of runs) {
    for (const entry of results.get(run.name) ?? []) {
      add(entry.caseID, run.kind === 'ranking' ? entry.ranking.facts.slice(0, topPlaces) : [...entry.ranking.facts, ...entry.ranking.selves]);
    }
  }

  for (const turn of turns) {
    add(
      turn.caseID,
      turn.logged.map((item) => item.itemID),
    );
  }

  return pools;
}
