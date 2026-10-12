import { readItemHistory } from './read-item-history';
import { readRecall } from './read-recall';
import { runForget } from './run-forget';
import type { MemoryStore, StoreParts } from './types';
import { writePin } from './write-pin';
import { writeRememberedItem } from './write-remembered-item';
import { writeRestoration } from './write-restoration';
import { writeRetirement } from './write-retirement';
import { writeUndo } from './write-undo';

// The one interface over the store's parts, which the model's tools and the client both call.
export function buildMemoryStore(parts: StoreParts): MemoryStore {
  return {
    recall: (request) => readRecall(parts, request),
    remember: (request) => writeRememberedItem(parts, request),
    retire: (request) => writeRetirement(parts, request),
    restore: (request) => writeRestoration(parts, request),
    undo: (request) => writeUndo(parts, request),
    pin: (request) => writePin(parts, request),
    forget: (request) => runForget(parts, request),
    readHistory: (itemID) => readItemHistory(parts, itemID),
  };
}
