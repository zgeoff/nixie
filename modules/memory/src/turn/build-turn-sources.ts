import { readMessageRecall } from '../message/read-message-recall';
import type { StoreParts } from '../types';
import { readItemStates } from './read-item-states';
import type { TurnSources } from './types';

export function buildTurnSources(parts: StoreParts): TurnSources {
  return {
    index: parts.index,
    vectors: parts.vectors,
    triggers: parts.triggers,
    readItemStates: () => readItemStates(parts),
    readMessageMatches: async (request) => {
      const recalled = await readMessageRecall(parts, request);

      return recalled.messages;
    },
  };
}
