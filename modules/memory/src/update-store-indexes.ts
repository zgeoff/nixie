import { readIndexEntries } from './read-index-entries';
import type { StoreParts } from './types';

export interface UpdatedIndexes {
  // the vector index's rebuild, which runs on after the keyword index is full; false with no encoder
  readonly rebuilt: Promise<boolean>;
}

// Fills the keyword index from the readable active items and starts the vector index's rebuild from
// the same items, which takes seconds, so the store starts without waiting for it.
export async function updateStoreIndexes(parts: StoreParts): Promise<UpdatedIndexes> {
  const entries = await readIndexEntries(parts.context);

  await parts.index.updateAll(entries);

  return { rebuilt: parts.vectors?.rebuild(entries) ?? Promise.resolve(false) };
}
