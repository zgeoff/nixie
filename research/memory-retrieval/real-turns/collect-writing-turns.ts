import type { TurnCase } from './build-turn-cases.ts';
import type { PlainRecord } from './read-plain-export.ts';

const writingKinds = new Set(['memory.proposed', 'memory.proposal_self_noted', 'memory.proposal_shared_noted']);

// Collects the turns whose exchange proposed a memory, between the turn's retrieval and the next
// turn's. On such a turn a served item can help by preventing a duplicate rather than by informing
// the reply, so its scores stand apart.
export function collectWritingTurns(turns: TurnCase[], records: PlainRecord[]): Set<string> {
  const proposed = records.filter((record) => writingKinds.has(record.kind)).map((record) => record.sequence);
  const ordered = turns.toSorted((first, second) => first.recalledSequence - second.recalledSequence);

  return new Set(
    ordered
      .filter((turn, position) => {
        const end = ordered[position + 1]?.recalledSequence ?? Number.POSITIVE_INFINITY;

        return proposed.some((sequence) => sequence > turn.recalledSequence && sequence < end);
      })
      .map((turn) => turn.caseID),
  );
}
