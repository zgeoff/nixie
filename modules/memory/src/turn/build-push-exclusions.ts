import type { MemoryRef } from '@heynixie/sessions';
import type { ItemState } from './types';

// The only place that decides which items no push picks: a lapsed item, a pinned item, an item
// whose current text version the session holds, and an item that a memory write in the session
// touched.
export function buildPushExclusions(
  states: readonly ItemState[],
  held: readonly MemoryRef[],
  written: readonly string[],
): readonly string[] {
  const heldKeys = new Set(held.map((ref) => `${ref.itemID}@${ref.version}`));
  const writtenIDs = new Set(written);

  return states
    .filter(
      (state) =>
        state.isLapsed ||
        state.isPinned ||
        writtenIDs.has(state.itemID) ||
        heldKeys.has(`${state.itemID}@${state.version}`),
    )
    .map((state) => state.itemID);
}
