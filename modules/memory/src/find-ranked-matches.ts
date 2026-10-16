import { buildVectorQuery } from './build-vector-query';
import type { RankedMatch } from './merge-rankings';
import { mergeRankings } from './merge-rankings';
import type { VectorMatch } from './start-vector-index';
import type { SearchMode, StoreParts } from './types';

export interface RankQuery {
  readonly query: string;
  readonly limit: number;

  // items the ranking leaves out before the limit applies
  readonly excludedIDs: readonly string[];

  // query words the ranking leaves out, as RecallRequest.excludedWords sets out
  readonly excludedWords?: readonly string[];

  // the lowest keyword score a match keeps; every match when unset
  readonly minScore?: number;

  // the lowest similarity a semantic match keeps; 0.3 when unset
  readonly minSimilarity?: number;
}

export interface RankedMatches {
  // best match first
  readonly matches: readonly RankedMatch[];
  readonly searchMode: SearchMode;
}

// Ranks the active items that match a query, and returns their IDs and scores, never their text.
// Each index ranks above its own floor, reciprocal rank fusion merges the two rankings, and the
// keyword matches stand alone while the vectors rebuild.
export async function findRankedMatches(
  parts: StoreParts,
  query: RankQuery,
): Promise<RankedMatches> {
  const [keywordMatches, vectorMatches] = await Promise.all([
    parts.index.findMatches(query.query, {
      limit: query.limit,
      excludedIDs: query.excludedIDs,
      ...(query.excludedWords === undefined ? {} : { excludedWords: query.excludedWords }),
      ...(query.minScore === undefined ? {} : { minScore: query.minScore }),
    }),
    findVectorMatches(parts, query),
  ]);

  return {
    matches: mergeRankings(keywordMatches, vectorMatches ?? []).slice(0, query.limit),
    searchMode: pickSearchMode(parts, vectorMatches),
  };
}

// the vector index's matches for the query less its excluded words, or null while the index
// rebuilds or with no encoder
function findVectorMatches(
  parts: StoreParts,
  query: RankQuery,
): Promise<readonly VectorMatch[] | null> {
  if (parts.vectors === null) {
    return Promise.resolve(null);
  }

  return parts.vectors.findMatches(buildVectorQuery(query.query, query.excludedWords ?? []), {
    limit: query.limit,
    minSimilarity: query.minSimilarity ?? defaultMinSimilarity,
    excludedIDs: query.excludedIDs,
  });
}

// the floor for a recall that sets none, such as the model's own memory.recall; per-turn retrieval
// sets its own from the configuration
const defaultMinSimilarity = 0.3;

function pickSearchMode(
  parts: StoreParts,
  vectorMatches: readonly VectorMatch[] | null,
): SearchMode {
  if (parts.vectors === null) {
    return 'keyword';
  }

  return vectorMatches === null ? 'keyword-fallback' : 'hybrid';
}
