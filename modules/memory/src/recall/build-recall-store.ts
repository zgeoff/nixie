import { readRecall } from '../item/read-recall';
import { buildMemoryView } from '../memory/build-memory-view';
import { writeMemoryRatings } from '../memory/write-memory-ratings';
import { readMessageRecall } from '../message/read-message-recall';
import type { MemoryStore, StoreParts } from '../types';
import { removeMessageEntries } from '../utils/remove-message-entries';

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
