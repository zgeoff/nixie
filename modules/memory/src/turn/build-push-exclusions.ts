import type { MemoryRef } from '@heynixie/sessions';
import type { ItemState } from './types';

// The only place that decides which items no push picks: a lapsed item, a pinned item, and an item
// whose current text version the session holds.
export function buildPushExclusions(
  states: readonly ItemState[],
  held: readonly MemoryRef[],
): readonly string[] {
  const heldKeys = new Set(held.map((ref) => `${ref.itemID}@${ref.version}`));

  return states
    .filter(
      (state) =>
        state.isLapsed || state.isPinned || heldKeys.has(`${state.itemID}@${state.version}`),
    )
    .map((state) => state.itemID);
}
