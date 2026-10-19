import type { VectorMatch } from './start-vector-index';

// What placed an item: its keyword score where the keyword index matched it, and its similarity
// where the vector index did.
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

// the rank offset from the reciprocal rank fusion paper, which keeps the first few ranks from
// outweighing an item that both lists place
const fusionK = 60;

// Fuses the keyword and vector rankings by reciprocal rank, each list giving an item 1 / (k + rank),
// because BM25 and cosine similarity share no scale. An item both lists rank high comes first, and
// equal sums keep the keyword order.
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
