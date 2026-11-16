import { readRecall } from '../item/read-recall';
import { buildMemoryView } from '../memory/build-memory-view';
import { readTurnMemory } from '../turn/read-turn-memory';
import type { MemoryStore, StoreParts } from '../types';

export function buildRecallStore(
  parts: StoreParts,
): Pick<MemoryStore, 'readTurnMemory' | 'recall' | 'view'> {
  return {
    readTurnMemory: (ask) => readTurnMemory(parts, ask),
    recall: (request) => readRecall(parts, request),
    view: buildMemoryView(parts),
  };
}
