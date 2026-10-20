import { readItemIDMap } from './read-item-id-map';
import { readShortIDs } from './read-short-ids';
import type { ItemIDStore, StoreParts } from './types';

// The lookups between the short IDs the model reads and the item IDs the store keys items by.
export function buildItemIDStore(parts: StoreParts): ItemIDStore {
  return {
    readItemIDMap: (ids) => readItemIDMap(parts, ids),
    readShortIDs: (itemIDs) => readShortIDs(parts, itemIDs),
  };
}
