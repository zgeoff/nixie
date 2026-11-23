import type { StoreParts } from '../types';
import { readItemStates } from './read-item-states';
import { readWrittenItemIDs } from './read-written-item-ids';
import type { TurnSources } from './types';

export function buildTurnSources(parts: StoreParts): TurnSources {
  return {
    index: parts.index,
    vectors: parts.vectors,
    triggers: parts.triggers,
    readItemStates: () => readItemStates(parts),
    readWrittenItemIDs: (query) => readWrittenItemIDs(parts, query),
  };
}
