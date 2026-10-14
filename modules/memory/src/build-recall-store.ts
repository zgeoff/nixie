import { readRecall } from './read-recall';
import type { MemoryStore, StoreParts } from './types';
import { writeMemoryRatings } from './write-memory-ratings';

// A recall, and the model's ratings of what the thread's latest recall delivered.
export function buildRecallStore(parts: StoreParts): Pick<MemoryStore, 'recall' | 'rate'> {
  return {
    recall: (request) => readRecall(parts, request),
    rate: (request) => writeMemoryRatings(parts, request),
  };
}
