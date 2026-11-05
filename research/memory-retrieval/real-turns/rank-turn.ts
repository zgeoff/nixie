// Ranks the store as it stood at one turn for that turn's message. `rankWithProduct` runs nixie's own
// index, vector index and fusion with the shipped settings, to check the rebuilt turns against what
// the log recorded. `rankTurn` runs the same steps with each setting open, for the sweeps.
// @boundaries-ignore a spike imports the code it measures
import { buildVectorQuery } from '../../../modules/memory/src/build-vector-query.ts';
// @boundaries-ignore a spike imports the code it measures
import { mergeRankings } from '../../../modules/memory/src/merge-rankings.ts';
// @boundaries-ignore a spike imports the code it measures
import type { MemoryIndex } from '../../../modules/memory/src/start-memory-index.ts';
// @boundaries-ignore a spike imports the code it measures
import { startVectorIndex } from '../../../modules/memory/src/start-vector-index.ts';
// @boundaries-ignore a spike imports the code it measures
import type { Encoder } from '../../../modules/memory/src/types.ts';
import { buildSimilarity } from './build-similarity.ts';
import type { Candidate, TurnCase } from './build-turn-cases.ts';
import type { ShortRule } from './pick-turn-query.ts';
import { pickTurnQuery } from './pick-turn-query.ts';

export interface RankConfig {
  mode: 'hybrid' | 'vector' | 'keyword';
  minScore: number;
  minSimilarity: number;
  fusionK: number;
  vectorWeight: number;
  width: number | null;
  isInt8: boolean;
  listLimit: number;
  factLimit: number;
  selfLimit: number;
  isSplit: boolean;
  isDeliveredExcluded: boolean;
  shortRule: ShortRule;
  isPastedDropped: boolean;
}

export const SHIPPED: RankConfig = {
  mode: 'hybrid',
  minScore: 0.25,
  minSimilarity: 0.38,
  fusionK: 60,
  vectorWeight: 1,
  width: 256,
  isInt8: true,
  listLimit: 5,
  factLimit: 5,
  selfLimit: 2,
  isSplit: true,
  isDeliveredExcluded: true,
  shortRule: { kind: 'none' },
  isPastedDropped: false,
};

export interface TurnRanking {
  facts: string[];
  selves: string[];
}

export interface Ranker {
  readonly rankWithProduct: (turn: TurnCase, excludedWords: string[]) => Promise<TurnRanking>;
  readonly rankTurn: (turn: TurnCase, config: RankConfig, excludedWords: string[]) => Promise<TurnRanking>;
}

// The index holds one turn's store at a time, and the ranker reloads it when the turn changes.
export function buildRanker(encoder: Encoder, index: MemoryIndex): Ranker {
  const loaded = { turn: '' };

  // Most turns share the same items, so each text is encoded once.
  const documentVectors = new Map<string, Float32Array>();

  const loadIndex = async (turn: TurnCase) => {
    if (loaded.turn !== turn.caseID) {
      await index.updateAll(turn.candidates.map((candidate) => ({ itemID: candidate.itemID, text: candidate.text })));
      loaded.turn = turn.caseID;
    }
  };

  const encodeDocuments = async (texts: string[]): Promise<Float32Array[]> => {
    const missing = [...new Set(texts.filter((text) => !documentVectors.has(text)))];
    const encoded = missing.length === 0 ? [] : await encoder.encode(missing, 'document');

    for (const [position, text] of missing.entries()) {
      documentVectors.set(text, encoded[position] ?? new Float32Array());
    }

    return texts.map((text) => documentVectors.get(text) ?? new Float32Array());
  };

  return {
    rankWithProduct: async (turn, excludedWords) => {
      await loadIndex(turn);

      const vectors = startVectorIndex(encoder, (error) => {
        throw error;
      });

      await vectors.rebuild(turn.candidates.map((candidate) => ({ itemID: candidate.itemID, text: candidate.text })));

      const rank = async (excludedIDs: string[], limit: number) => {
        const [keyword, vector] = await Promise.all([
          index.readMatches(turn.query, { limit, excludedIDs, excludedWords, minScore: SHIPPED.minScore }),
          vectors.readMatches(buildVectorQuery(turn.query, excludedWords), {
            limit,
            minSimilarity: SHIPPED.minSimilarity,
            excludedIDs,
          }),
        ]);

        return mergeRankings(keyword, vector ?? [])
          .slice(0, limit)
          .map((match) => match.itemID);
      };

      const excluded = collectExcludedIDs(turn, true);
      const selfIDs = turn.candidates.filter((candidate) => candidate.isSelf).map((candidate) => candidate.itemID);
      const otherIDs = turn.candidates.filter((candidate) => !candidate.isSelf).map((candidate) => candidate.itemID);

      const result = {
        facts: await rank([...excluded, ...selfIDs], SHIPPED.factLimit),
        selves: await rank([...excluded, ...otherIDs], SHIPPED.selfLimit),
      };

      await vectors.stop();

      return result;
    },
    rankTurn: async (turn, config, excludedWords) => {
      const query = pickTurnQuery(turn, config.shortRule, config.isPastedDropped);

      if (query.isSkipped) {
        return { facts: [], selves: [] };
      }

      await loadIndex(turn);

      const mode = query.isVectorOnly ? 'vector' : config.mode;
      const queryText = buildVectorQuery(query.text, excludedWords);
      const [queryVector] = queryText.trim() === '' ? [] : await encoder.encode([queryText], 'query');
      const itemVectors = await encodeDocuments(turn.candidates.map((candidate) => candidate.text));

      const excluded = collectExcludedIDs(turn, config.isDeliveredExcluded);

      // The product passes one limit to both lists and to the fused result.
      const rank = async (pool: Candidate[], limit: number, listLimit: number) => {
        const poolIDs = new Set(pool.map((candidate) => candidate.itemID));
        const outside = turn.candidates.filter((candidate) => !poolIDs.has(candidate.itemID)).map((candidate) => candidate.itemID);

        const keyword =
          mode === 'vector'
            ? []
            : await index.readMatches(query.text, {
                // SQLite takes a whole number as its limit, and the store bounds the list anyway.
                limit: Math.min(listLimit, turn.candidates.length),
                excludedIDs: [...excluded, ...outside],
                excludedWords,
                minScore: config.minScore,
              });

        const vector =
          mode === 'keyword' || queryVector === undefined
            ? []
            : turn.candidates
                .map((candidate, position) => ({ candidate, vector: itemVectors[position] }))
                .filter((entry) => poolIDs.has(entry.candidate.itemID) && !excluded.has(entry.candidate.itemID))
                .map((entry) => ({
                  itemID: entry.candidate.itemID,
                  similarity: buildSimilarity(queryVector, entry.vector ?? new Float32Array(), config),
                }))
                .filter((match) => match.similarity >= config.minSimilarity)
                .toSorted((first, second) => second.similarity - first.similarity)
                .slice(0, listLimit);

        const fused = buildFusedRanking(keyword, vector, config);

        if (!query.isAgreementNeeded) {
          return fused.slice(0, limit);
        }

        const inBoth = new Set(keyword.map((entry) => entry.itemID).filter((itemID) => vector.some((entry) => entry.itemID === itemID)));

        return fused.filter((itemID) => inBoth.has(itemID)).slice(0, limit);
      };

      if (!config.isSplit) {
        return { facts: await rank(turn.candidates, config.factLimit, config.listLimit), selves: [] };
      }

      return {
        facts: await rank(
          turn.candidates.filter((candidate) => !candidate.isSelf),
          config.factLimit,
          config.listLimit,
        ),
        selves: await rank(
          turn.candidates.filter((candidate) => candidate.isSelf),
          config.selfLimit,
          config.selfLimit,
        ),
      };
    },
  };
}

// The store leaves out a pinned item, which the pinned core already shows, a lapsed one, a
// sensitive one, and a version this session was already given.
function collectExcludedIDs(turn: TurnCase, isDeliveredExcluded: boolean): Set<string> {
  const delivered = new Set(isDeliveredExcluded ? turn.delivered : []);

  return new Set(
    turn.candidates
      .filter(
        (candidate) =>
          candidate.isPinned ||
          candidate.isLapsed ||
          candidate.isSensitive ||
          delivered.has(`${candidate.itemID}@${candidate.version}`),
      )
      .map((candidate) => candidate.itemID),
  );
}

function buildFusedRanking(
  keyword: readonly { itemID: string }[],
  vector: readonly { itemID: string }[],
  config: RankConfig,
): string[] {
  const fused = new Map<string, number>();

  for (const [rank, match] of keyword.entries()) {
    fused.set(match.itemID, (fused.get(match.itemID) ?? 0) + 1 / (config.fusionK + rank + 1));
  }

  for (const [rank, match] of vector.entries()) {
    fused.set(match.itemID, (fused.get(match.itemID) ?? 0) + config.vectorWeight / (config.fusionK + rank + 1));
  }

  return [...fused.entries()].toSorted((first, second) => second[1] - first[1]).map(([itemID]) => itemID);
}
