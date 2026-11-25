import type { CallsContext } from '../types';

// Closes the hand-offs that a turn the user cut took, so none of them gets an answer or the holding
// line later. A hang-up the cut turn asked for is dropped with them.
export function closeCutHandOffs(
  context: CallsContext,
  callID: string,
  handOffIDs: readonly string[],
): void {
  const handOffs = context.runtime.handOffs.get(callID);

  for (const handOffID of handOffIDs) {
    const handOff = handOffs?.get(handOffID);

    if (handOff !== undefined) {
      handOff.isAnswered = true;

      handOff.holding.abort();
    }
  }

  context.runtime.hangUps.delete(callID);
}
