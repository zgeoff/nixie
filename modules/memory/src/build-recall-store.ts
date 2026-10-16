import { readMessageRecall } from './read-message-recall';
import { readRecall } from './read-recall';
import { removeMessageEntries } from './remove-message-entries';
import type { MemoryStore, StoreParts } from './types';
import { writeMemoryRatings } from './write-memory-ratings';

// A recall of items or of your past messages, the removal of a forgotten message from the message
// indexes, and the model's ratings of what the thread's latest recall delivered.
export function buildRecallStore(
  parts: StoreParts,
): Pick<MemoryStore, 'recall' | 'recallMessages' | 'removeMessages' | 'rate'> {
  return {
    recall: (request) => readRecall(parts, request),
    recallMessages: (request) => readMessageRecall(parts, request),
    removeMessages: (sequences) => removeMessageEntries(parts, sequences),
    rate: (request) => writeMemoryRatings(parts, request),
  };
}
