import { readMemorySubjectCounts } from '@heynixie/db';
import { buildForgetStore } from './build-forget-store';
import { buildRecallStore } from './build-recall-store';
import { readItemHistory } from './read-item-history';
import { readPinnedCore } from './read-pinned-core';
import type { MemoryStore, StoreParts } from './types';
import { writeKeep } from './write-keep';
import { writePin } from './write-pin';
import { writeRememberedItem } from './write-remembered-item';
import { writeRestoration } from './write-restoration';
import { writeRetirement } from './write-retirement';
import { writeUndo } from './write-undo';

export function buildMemoryStore(parts: StoreParts): MemoryStore {
  return {
    ...buildRecallStore(parts),
    ...buildForgetStore(parts),
    remember: (request) => writeRememberedItem(parts, request),
    retire: (request) => writeRetirement(parts, request),
    restore: (request) => writeRestoration(parts, request),
    undo: (request) => writeUndo(parts, request),
    keep: (request) => writeKeep(parts, request),
    pin: (request) => writePin(parts, request),
    readPinnedCore: () => readPinnedCore(parts),
    readHistory: (itemID) => readItemHistory(parts, itemID),
    readSubjectCounts: () => readMemorySubjectCounts(parts.context.log.writer.db),
  };
}
