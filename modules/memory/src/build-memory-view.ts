import { readForgetPreview } from './read-forget-preview';
import { readItemDetail } from './read-item-detail';
import { readMemoryExport } from './read-memory-export';
import { readPinnedCoreView } from './read-pinned-core-view';
import { readViewMatches } from './read-view-matches';
import { readViewPage } from './read-view-page';
import { readViewProposals } from './read-view-proposals';
import type { StoreParts } from './types';
import type { MemoryView } from './view-types';

export function buildMemoryView(parts: StoreParts): MemoryView {
  const log = parts.context.log;

  return {
    readPage: (request) => readViewPage(log, request),
    readMatchingItems: (query) => readViewMatches(parts, query),
    readPinnedCore: () => readPinnedCoreView(parts),
    readItem: (itemID) => readItemDetail(log, itemID),
    readProposals: () => readViewProposals(parts),
    readForgetPreview: (target) => readForgetPreview(log, target),
    readExport: (request) => readMemoryExport(parts.context, request),
  };
}
