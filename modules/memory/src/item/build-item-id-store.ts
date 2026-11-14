import type { ItemIDStore, StoreParts } from '../types';
import { readShortIDs } from '../utils/read-short-ids';
import { readItemIDMap } from './read-item-id-map';

export function buildItemIDStore(parts: StoreParts): ItemIDStore {
  return {
    readItemIDMap: (ids) => readItemIDMap(parts, ids),
    readShortIDs: (itemIDs) => readShortIDs(parts, itemIDs),
  };
}
