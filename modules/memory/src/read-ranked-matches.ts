import { buildVectorQuery } from './build-vector-query';
import type { RankedMatch } from './merge-rankings';
import { mergeRankings } from './merge-rankings';
import type { VectorMatch } from './start-vector-index';
import type { SearchMode, StoreParts } from './types';

export interface RankQuery {
  readonly query: string;
  readonly limit: number;

  readonly excludedIDs: readonly string[];

  readonly excludedWords?: readonly string[];

  readonly minScore?: number;

  readonly minSimilarity?: number;
}

export interface RankedMatches {
  readonly matches: readonly RankedMatch[];
  readonly searchMode: SearchMode;
}

export async function readRankedMatches(
  parts: StoreParts,
  query: RankQuery,
): Promise<RankedMatches> {
  const [keywordMatches, vectorMatches] = await Promise.all([
    parts.index.readMatches(query.query, {
      limit: query.limit,
      excludedIDs: query.excludedIDs,
      ...(query.excludedWords === undefined ? {} : { excludedWords: query.excludedWords }),
      ...(query.minScore === undefined ? {} : { minScore: query.minScore }),
    }),
    readVectorMatches(parts, query),
  ]);

  return {
    matches: mergeRankings(keywordMatches, vectorMatches ?? []).slice(0, query.limit),
    searchMode: pickSearchMode(parts, vectorMatches),
  };
}

const defaultMinSimilarity = 0.3;

function readVectorMatches(
  parts: StoreParts,
  query: RankQuery,
): Promise<readonly VectorMatch[] | null> {
  if (parts.vectors === null) {
    return Promise.resolve(null);
  }

  return parts.vectors.readMatches(buildVectorQuery(query.query, query.excludedWords ?? []), {
    limit: query.limit,
    minSimilarity: query.minSimilarity ?? defaultMinSimilarity,
    excludedIDs: query.excludedIDs,
  });
}

function pickSearchMode(
  parts: StoreParts,
  vectorMatches: readonly VectorMatch[] | null,
): SearchMode {
  if (parts.vectors === null) {
    return 'keyword';
  }

  return vectorMatches === null ? 'keyword-fallback' : 'hybrid';
}
