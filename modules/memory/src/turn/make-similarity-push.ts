import type { PastMessage } from '@heynixie/sessions';
import type { SearchMode } from '../types';
import { readRankedMatches } from '../view/read-ranked-matches';
import type { PushPick, PushTurn, SelectPush, TurnMemorySettings, TurnSources } from './types';

type SimilaritySettings = TurnMemorySettings['similarity'];

// The built per-turn search, until the similarity push cleanup deletes it.
export function makeSimilarityPush(similarity: SimilaritySettings): SelectPush {
  return async (sources, turn) => {
    const selfIDs = turn.states.filter((state) => state.isSelf).map((state) => state.itemID);
    const otherIDs = turn.states.filter((state) => !state.isSelf).map((state) => state.itemID);

    const states = new Map(turn.states.map((state) => [state.itemID, state]));

    const query = {
      query: turn.text,
      excludedWords: turn.excludedWords,
      minScore: similarity.minScore,
      minSimilarity: similarity.minSimilarity,
    };

    const [others, notes] = await Promise.all([
      similarity.items === 0
        ? null
        : readRankedMatches(sources, {
            ...query,
            limit: similarity.items,
            excludedIDs: [...turn.excludedIDs, ...selfIDs],
          }),
      similarity.selfNotes === 0
        ? null
        : readRankedMatches(sources, {
            ...query,
            limit: similarity.selfNotes,
            excludedIDs: [...turn.excludedIDs, ...otherIDs],
          }),
    ]);

    const ranked = [others, notes].flatMap((result) => (result === null ? [] : [result]));

    const picks = ranked
      .flatMap((result) => result.matches)
      .flatMap((match): readonly PushPick[] => {
        const state = states.get(match.itemID);

        return state === undefined
          ? []
          : [{ ...match, version: state.version, isSelf: state.isSelf }];
      });

    return {
      picks,
      messages: await readMessages(sources, turn, similarity),
      searchModes: ranked.map((result): SearchMode => result.searchMode),
    };
  };
}

async function readMessages(
  sources: TurnSources,
  turn: PushTurn,
  similarity: SimilaritySettings,
): Promise<readonly PastMessage[]> {
  if (similarity.messages === 0) {
    return [];
  }

  return sources.readMessageMatches({
    query: turn.text,
    limit: similarity.messages,
    minScore: similarity.minScore,
    minSimilarity: similarity.minSimilarity,
    excludedSequences: await turn.held.readMessages(),
    excludedWords: turn.excludedWords,
  });
}
