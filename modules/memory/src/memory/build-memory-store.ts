import { readMemorySubjectCounts } from '@heynixie/db';
import { buildForgetStore } from '../forget/build-forget-store';
import { readIndex } from '../index-block/read-index';
import { readTopicCounts } from '../index-block/read-topic-counts';
import { readTopicLines } from '../index-block/read-topic-lines';
import { readItemHistory } from '../item/read-item-history';
import { runItemLapses } from '../item/run-item-lapses';
import { writeRememberedItem } from '../item/write-remembered-item';
import { writePin } from '../pin/write-pin';
import { readPinnedCore } from '../pinned/read-pinned-core';
import { readPinnedCoreUse } from '../pinned/read-pinned-core-use';
import { buildRecallStore } from '../recall/build-recall-store';
import { writeRetirement } from '../retirement/write-retirement';
import type { MemoryStore, StoreParts } from '../types';
import { writeKeep } from './write-keep';
import { writeRestoration } from './write-restoration';
import { writeUndo } from './write-undo';

export function buildMemoryStore(parts: StoreParts): MemoryStore {
  return {
    ...buildRecallStore(parts),
    ...buildForgetStore(parts),
    remember: (request) => writeRememberedItem(parts, request),
    retire: (request) => writeRetirement(parts, request),
    lapse: () => runItemLapses(parts),
    restore: (request) => writeRestoration(parts, request),
    undo: (request) => writeUndo(parts, request),
    keep: (request) => writeKeep(parts, request),
    pin: (request) => writePin(parts, request),
    readPinnedCore: () => readPinnedCore(parts),
    readPinnedCoreUse: () => readPinnedCoreUse(parts),
    readIndex: () => readIndex(parts),
    readTopicLines: (request) => readTopicLines(parts, request),
    readTopicCounts: (request) => readTopicCounts(parts, request),
    readHistory: (itemID) => readItemHistory(parts, itemID),
    readSubjectCounts: () => readMemorySubjectCounts(parts.context.log.writer.db),
  };
}
