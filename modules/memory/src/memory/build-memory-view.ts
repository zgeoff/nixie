import { readForgetPreview } from '../forget/read-forget-preview';
import { readItemDetail } from '../item/read-item-detail';
import { readPinnedCoreView } from '../pinned/read-pinned-core-view';
import { readRetiredForgetPreview } from '../retired/read-retired-forget-preview';
import type { MemoryTables, StoreParts } from '../types';
import { readForgetStatus } from '../utils/read-forget-status';
import type { MemoryView } from '../view/memory-view';
import { readViewMatches } from '../view/read-view-matches';
import { readViewNotices } from '../view/read-view-notices';
import { readViewPage } from '../view/read-view-page';
import { readViewProposals } from '../view/read-view-proposals';
import { readMemoryExport } from './read-memory-export';

export function buildMemoryView(parts: StoreParts): MemoryView {
  const log = parts.context.log;

  return {
    readPage: (request) => readViewPage(log, request),
    readMatchingItems: (query) => readViewMatches(parts, query),
    readPinnedCore: () => readPinnedCoreView(parts),
    readItem: (itemID) => readItemDetail(log, itemID),
    readProposals: () => readViewProposals(parts),
    readForgetPreview: (target) => readForgetPreview(log, target),
    readRetiredForgetPreview: () => readRetiredForgetPreview(log),
    readForgetStatus: (itemIDs) =>
      readForgetStatus(log.writer.db.$extendTables<MemoryTables>(), itemIDs),
    readExport: (request) => readMemoryExport(parts.context, request),
    readNotices: (thread) => readViewNotices(parts, thread),
  };
}
