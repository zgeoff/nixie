import { findViewMatches } from './find-view-matches';
import { readForgetPreview } from './read-forget-preview';
import { readItemDetail } from './read-item-detail';
import { readMemoryExport } from './read-memory-export';
import { readPinnedCoreView } from './read-pinned-core-view';
import { readViewPage } from './read-view-page';
import { readViewProposals } from './read-view-proposals';
import type { StoreParts } from './types';
import type { MemoryView } from './view-types';

// The reads of the memory view over the store's parts. Search ranks through the store's indexes,
// the pending proposals open under their items' keys, and every other read, the export among them,
// goes to the log alone.
export function buildMemoryView(parts: StoreParts): MemoryView {
  const log = parts.context.log;

  return {
    readPage: (request) => readViewPage(log, request),
    findItems: (query) => findViewMatches(parts, query),
    readPinnedCore: () => readPinnedCoreView(parts),
    readItem: (itemID) => readItemDetail(log, itemID),
    readProposals: () => readViewProposals(parts),
    readForgetPreview: (target) => readForgetPreview(log, target),
    readExport: (request) => readMemoryExport(parts.context, request),
  };
}
