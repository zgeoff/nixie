import { findViewMatches } from './find-view-matches';
import { readItemDetail } from './read-item-detail';
import { readPinnedCoreView } from './read-pinned-core-view';
import { readViewPage } from './read-view-page';
import { readViewProposals } from './read-view-proposals';
import type { StoreParts } from './types';
import type { MemoryView } from './view-types';

// The reads of the memory view over the store's parts. Search ranks through the store's indexes,
// the pending proposals open under their items' keys, and every other read goes to the log alone.
export function buildMemoryView(parts: StoreParts): MemoryView {
  const log = parts.context.log;

  return {
    readPage: (request) => readViewPage(log, request),
    findItems: (query) => findViewMatches(parts, query),
    readPinnedCore: () => readPinnedCoreView(parts),
    readItem: (itemID) => readItemDetail(log, itemID),
    readProposals: () => readViewProposals(parts),
  };
}
