import type { TurnCase } from './build-turn-cases.ts';
import type { PlainVersion } from './read-plain-export.ts';

// Collects, for each turn, the items whose current version was added since the turn before it, such
// as one the user approved from the queue or one this exchange created. The exchange itself holds
// what such an item says, so retrieving it adds nothing and leaving it out misses nothing.
export function collectExchangeItems(turns: TurnCase[], versions: PlainVersion[]): Map<string, Set<string>> {
  const addedAt = new Map(versions.map((version) => [`${version.item_id}@${version.version}`, version.sequence]));
  const ordered = turns.toSorted((first, second) => first.recalledSequence - second.recalledSequence);
  const byCase = new Map<string, Set<string>>();

  for (const [position, turn] of ordered.entries()) {
    // The first turn has no exchange before it to bound, so it holds none.
    const since = ordered[position - 1]?.recalledSequence ?? turn.recalledSequence;
    const fresh = turn.candidates.filter((candidate) => {
      const sequence = addedAt.get(`${candidate.itemID}@${candidate.version}`);

      return sequence !== undefined && sequence > since && sequence < turn.recalledSequence;
    });

    if (fresh.length > 0) {
      byCase.set(turn.caseID, new Set(fresh.map((candidate) => candidate.itemID)));
    }
  }

  return byCase;
}
