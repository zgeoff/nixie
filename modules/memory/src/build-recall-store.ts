import { buildMemoryView } from './build-memory-view';
import { readMessageRecall } from './read-message-recall';
import { readRecall } from './read-recall';
import { removeMessageEntries } from './remove-message-entries';
import type { MemoryStore, StoreParts } from './types';
import { writeMemoryRatings } from './write-memory-ratings';

export function buildRecallStore(
  parts: StoreParts,
): Pick<MemoryStore, 'recall' | 'recallMessages' | 'removeMessages' | 'rate' | 'view'> {
  return {
    recall: (request) => readRecall(parts, request),
    recallMessages: (request) => readMessageRecall(parts, request),
    removeMessages: (sequences) => removeMessageEntries(parts, sequences),
    rate: (request) => writeMemoryRatings(parts, request),
    view: buildMemoryView(parts),
  };
}
