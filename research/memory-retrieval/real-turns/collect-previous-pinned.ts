// @boundaries-ignore a spike imports the code it measures
import type { MemoryRef } from '../../../modules/sessions/src/types.ts';
import type { TurnCase } from './build-turn-cases.ts';

// For each turn, the pinned core of the turn before it in the same session, which the product
// compares against to write its change note, or null for a session's first turn.
export function collectPreviousPinned(turns: readonly Pick<TurnCase, 'sessionNumber' | 'candidates'>[]): (MemoryRef[] | null)[] {
  return turns.map((turn, position) => {
    const previous = turns[position - 1];

    return previous === undefined || previous.sessionNumber !== turn.sessionNumber
      ? null
      : previous.candidates.filter((candidate) => candidate.isPinned).map((candidate) => ({ itemID: candidate.itemID, version: candidate.version }));
  });
}
