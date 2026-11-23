import type { PushPick, SelectPush, TurnMemorySettings } from './types';

export function makeTriggerPush(trigger: TurnMemorySettings['trigger']): SelectPush {
  return async (sources, turn) => {
    const states = new Map(turn.states.map((state) => [state.itemID, state]));

    const found = await sources.triggers.readMatches(turn.text, {
      limit: Number.MAX_SAFE_INTEGER,
      minScore: trigger.minScore,
      minSimilarity: trigger.minSimilarity,
      excludedIDs: turn.excludedIDs,
      excludedWords: turn.excludedWords,
    });

    // A retired item can still hold phrases, so only an active item takes a slot.
    const picks = found.matches
      .flatMap((match): readonly PushPick[] => {
        const state = states.get(match.itemID);

        return state === undefined
          ? []
          : [
              {
                itemID: state.itemID,
                version: state.version,
                isSelf: state.isSelf,
                triggers: match.triggers,
                ...(match.score === undefined ? {} : { score: match.score }),
                ...(match.similarity === undefined ? {} : { similarity: match.similarity }),
              },
            ];
      })
      .slice(0, trigger.items);

    return {
      picks,
      searchModes: [found.searchMode],
    };
  };
}
