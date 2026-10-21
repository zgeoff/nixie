import type { VectorMatch } from './start-vector-index';

export interface MatchScores {
  readonly score?: number;
  readonly similarity?: number;
}

interface KeywordMatch {
  readonly itemID: string;
  readonly score: number;
}

export interface RankedMatch extends MatchScores {
  readonly itemID: string;
}

// The rank offset from the reciprocal rank fusion paper. Fusion goes by rank, because BM25 scores
// and cosine similarities share no scale.
const fusionK = 60;

export function mergeRankings(
  keywordMatches: readonly KeywordMatch[],
  vectorMatches: readonly VectorMatch[],
): readonly RankedMatch[] {
  const merged = new Map<string, { match: RankedMatch; fused: number }>();

  for (const [rank, match] of keywordMatches.entries()) {
    merged.set(match.itemID, {
      match: { itemID: match.itemID, score: match.score },
      fused: 1 / (fusionK + rank + 1),
    });
  }

  for (const [rank, match] of vectorMatches.entries()) {
    const entry = merged.get(match.itemID);
    const fused = 1 / (fusionK + rank + 1);

    merged.set(match.itemID, {
      match: { ...entry?.match, itemID: match.itemID, similarity: match.similarity },
      fused: (entry?.fused ?? 0) + fused,
    });
  }

  return [...merged.values()]
    .toSorted((first, second) => second.fused - first.fused)
    .map((entry) => entry.match);
}
