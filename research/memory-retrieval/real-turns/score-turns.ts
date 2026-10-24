// Scores rankings of the rebuilt turns against labels: recall@5, recall@10 and mean reciprocal rank
// on one ranking, with no floor or cut, of every item the turn's retrieval could return, and, for
// the set a turn would be shown under each floor, the share of labelled items it covers and the
// items it shows on turns that need none.
import type { TurnCase } from './build-turn-cases.ts';
import invariant from 'tiny-invariant';
import { z } from 'zod';
// @boundaries-ignore a spike imports the code it measures
import type { MemoryIndex } from '../../../modules/memory/src/start-memory-index.ts';
import type { EncoderName, TurnEncoder } from './load-turn-encoder.ts';
import { makeRandom } from './make-random.ts';
import type { RankConfig, TurnRanking } from './rank-turn.ts';
import { buildRanker, SHIPPED } from './rank-turn.ts';

// A label names items by the references local to its turn, and the sample key maps each reference
// to the item it stands for.
export const labelSchema = z.object({
  caseID: z.string(),
  relevant: z.array(z.string()),
  best: z.string().nullable(),
});

export type Label = z.infer<typeof labelSchema>;

export const sampleKeySchema = z.object({
  caseID: z.string(),
  refs: z.record(z.string(), z.string()),
});

export interface Run {
  name: string;
  encoder: EncoderName;
  kind: 'ranking' | 'served';
  config: RankConfig;
  isShipped: boolean;
}

// A ranking run keeps every item, so a needed item past rank 10 still counts toward MRR.
const rankingBase: RankConfig = {
  ...SHIPPED,
  minScore: 0,
  minSimilarity: -1,
  listLimit: Number.POSITIVE_INFINITY,
  factLimit: Number.POSITIVE_INFINITY,
  isSplit: false,
  isDeliveredExcluded: false,
};

// The shipped encoder always runs, because every comparison is against its shipped runs, and the
// fusion, width, floor and item-count runs sweep it alone.
export function buildRuns(encoders: EncoderName[]): Run[] {
  const runs: Run[] = [];
  const shipped: EncoderName = 'leaf-ir-q8';

  // Only the shipped model is trained so that its first numbers carry the meaning, so the others
  // keep every number.
  for (const encoder of new Set([shipped, ...encoders])) {
    const config = encoder === shipped ? rankingBase : { ...rankingBase, width: null };

    runs.push(
      { name: `${encoder} hybrid`, encoder, kind: 'ranking', config, isShipped: encoder === shipped },
      { name: `${encoder} vectors`, encoder, kind: 'ranking', config: { ...config, mode: 'vector' }, isShipped: false },
    );
  }

  const sweep = (name: string, kind: Run['kind'], config: RankConfig): Run => ({
    name: `${shipped} ${name}`,
    encoder: shipped,
    kind,
    config,
    isShipped: false,
  });

  runs.push(
    { ...sweep('', 'ranking', { ...rankingBase, mode: 'keyword' }), name: 'BM25' },
    sweep('hybrid, full width', 'ranking', { ...rankingBase, width: null, isInt8: false }),
    sweep('hybrid, k 20', 'ranking', { ...rankingBase, fusionK: 20 }),
    sweep('hybrid, vectors x2', 'ranking', { ...rankingBase, vectorWeight: 2 }),
    sweep('served, shipped floors, nothing delivered', 'served', { ...SHIPPED, isDeliveredExcluded: false }),
  );

  for (const limit of [3, 4]) {
    runs.push(
      sweep(`served, shipped floors, nothing delivered, ${limit} items`, 'served', {
        ...SHIPPED,
        isDeliveredExcluded: false,
        factLimit: limit,
        listLimit: limit,
      }),
    );
  }

  for (const limit of [3, 4, 8]) {
    runs.push(sweep(`served, shipped floors, ${limit} items`, 'served', { ...SHIPPED, factLimit: limit, listLimit: limit }));
  }

  for (const minSimilarity of [0.3, 0.34, 0.38, 0.42, 0.46]) {
    for (const minScore of [0.25, 1, 2]) {
      runs.push({
        ...sweep(`served, similarity ${minSimilarity}, BM25 ${minScore}`, 'served', { ...SHIPPED, minSimilarity, minScore }),
        isShipped: minSimilarity === SHIPPED.minSimilarity && minScore === SHIPPED.minScore,
      });
    }

    runs.push(sweep(`served vectors, similarity ${minSimilarity}`, 'served', { ...SHIPPED, mode: 'vector', minSimilarity }));
  }

  return runs;
}

// Each comparison is against the shipped run of its kind, whatever order the encoders came in.
export function getShippedRun(runs: Run[], kind: Run['kind']): Run {
  const shipped = runs.find((run) => run.isShipped && run.kind === kind);

  invariant(shipped !== undefined, `the runs hold no shipped ${kind} run`);

  return shipped;
}

export interface RankedTurn {
  caseID: string;
  ranking: TurnRanking;
}

export interface RankingResources {
  loadEncoder: (name: EncoderName) => Promise<TurnEncoder>;
  startIndex: () => Promise<MemoryIndex>;
}

// Each encoder gets its own index for its runs, and both stop before the next encoder loads.
export async function runRankings(
  turns: TurnCase[],
  runs: Run[],
  resources: RankingResources,
  excludedWords: string[],
): Promise<Map<string, RankedTurn[]>> {
  const results = new Map<string, RankedTurn[]>(runs.map((run) => [run.name, []]));

  for (const encoderName of [...new Set(runs.map((run) => run.encoder))]) {
    const encoder = await resources.loadEncoder(encoderName);
    const index = await resources.startIndex();
    const ranker = buildRanker(encoder, index);
    const own = runs.filter((run) => run.encoder === encoderName);

    for (const turn of turns) {
      for (const run of own) {
        const ranking = await ranker.rankTurn(turn, run.config, excludedWords);

        results.get(run.name)?.push({ caseID: turn.caseID, ranking });
      }
    }

    await index.stop();
    await encoder.stop();
  }

  return results;
}

export interface RankingScore {
  cases: number;
  recallAt3: number;
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  bestAt5: number;
}

export function scoreRanking(ranked: RankedTurn[], gold: Map<string, Gold>): RankingScore {
  const scored = ranked.filter((entry) => (gold.get(entry.caseID)?.relevant.size ?? 0) > 0);

  const perCase = scored.map((entry) => {
    const expected = gold.get(entry.caseID);
    const list = entry.ranking.facts;
    const relevant = expected?.relevant ?? new Set<string>();
    const first = list.findIndex((itemID) => relevant.has(itemID));

    return {
      at3: list.slice(0, 3).filter((itemID) => relevant.has(itemID)).length / relevant.size,
      at5: list.slice(0, 5).filter((itemID) => relevant.has(itemID)).length / relevant.size,
      at10: list.slice(0, 10).filter((itemID) => relevant.has(itemID)).length / relevant.size,
      reciprocal: first === -1 ? 0 : 1 / (first + 1),
      best: expected?.best !== null && expected?.best !== undefined && list.slice(0, 5).includes(expected.best) ? 1 : 0,
    };
  });

  return {
    cases: scored.length,
    recallAt3: round(average(perCase.map((value) => value.at3))),
    recallAt5: round(average(perCase.map((value) => value.at5))),
    recallAt10: round(average(perCase.map((value) => value.at10))),
    mrr: round(average(perCase.map((value) => value.reciprocal))),
    bestAt5: round(average(perCase.map((value) => value.best))),
  };
}

export interface PairedDifference {
  mean: number;
  low: number;
  high: number;
}

// A paired bootstrap over the cases a metric scores: each resample draws cases with replacement
// and takes the mean difference between a run and the shipped run on the same cases.
export function buildPairedDifference(
  run: RankedTurn[],
  base: RankedTurn[],
  gold: Map<string, Gold>,
  metric: CaseMetric,
): PairedDifference {
  const baseByCase = new Map(base.map((entry) => [entry.caseID, entry]));

  const differences = run.flatMap((entry) => {
    const expected = gold.get(entry.caseID);
    const other = baseByCase.get(entry.caseID);
    const value = expected === undefined ? null : buildCaseMetric(entry, expected, metric);
    const baseValue = expected === undefined || other === undefined ? null : buildCaseMetric(other, expected, metric);

    return value === null || baseValue === null ? [] : [value - baseValue];
  });

  const random = makeRandom(1);

  const means = Array.from({ length: 2000 }, () => {
    let sum = 0;

    for (let draw = 0; draw < differences.length; draw += 1) {
      sum += differences[Math.floor(random() * differences.length)] ?? 0;
    }

    return differences.length === 0 ? 0 : sum / differences.length;
  }).toSorted((first, second) => first - second);

  return {
    mean: round(average(differences)),
    low: round(means[Math.floor(means.length * 0.025)] ?? 0),
    high: round(means[Math.floor(means.length * 0.975)] ?? 0),
  };
}

export type CaseMetric = 'at5' | 'reciprocal' | 'fresh' | 'shownOnEmpty';

// Returns null for a case the metric does not score.
function buildCaseMetric(entry: RankedTurn, expected: Gold, metric: CaseMetric): number | null {
  const list = entry.ranking.facts;
  const shown = [...entry.ranking.facts, ...entry.ranking.selves];

  if (metric === 'shownOnEmpty') {
    return expected.isLabelled && expected.relevant.size === 0 ? shown.length : null;
  }

  if (expected.relevant.size === 0) {
    return null;
  }

  if (metric === 'fresh') {
    const unseen = [...expected.relevant].filter((itemID) => !expected.delivered.has(itemID));

    return unseen.length === 0 ? null : unseen.filter((itemID) => shown.includes(itemID)).length / unseen.length;
  }

  if (metric === 'at5') {
    return list.slice(0, 5).filter((itemID) => expected.relevant.has(itemID)).length / expected.relevant.size;
  }

  const first = list.findIndex((itemID) => expected.relevant.has(itemID));

  return first === -1 ? 0 : 1 / (first + 1);
}

export interface ServedScore {
  goldCases: number;
  coveredRecall: number;
  freshCases: number;
  freshRecall: number;
  emptyCases: number;
  shownOnEmpty: number;
  emptyWithAny: number;
  precision: number;
  noiseServed: number;
}

export interface Gold {
  relevant: Set<string>;
  best: string | null;
  noise: Set<string>;
  delivered: Set<string>;
  isLabelled: boolean;
}

// An item the session was given earlier is still in the model's context, so it counts as covered.
export function scoreServed(ranked: RankedTurn[], gold: Map<string, Gold>): ServedScore {
  const labelled = ranked.filter((entry) => gold.get(entry.caseID)?.isLabelled === true);
  const withGold = labelled.filter((entry) => (gold.get(entry.caseID)?.relevant.size ?? 0) > 0);
  const empty = labelled.filter((entry) => (gold.get(entry.caseID)?.relevant.size ?? 0) === 0);
  const shown = (entry: RankedTurn) => [...entry.ranking.facts, ...entry.ranking.selves];

  const covered = withGold.map((entry) => {
    const expected = gold.get(entry.caseID);
    const relevant = expected?.relevant ?? new Set<string>();
    const reached = new Set([...shown(entry), ...(expected?.delivered ?? [])]);

    return [...relevant].filter((itemID) => reached.has(itemID)).length / relevant.size;
  });

  // A needed item the session had not been given yet is one only this turn's retrieval can bring.
  const fresh = withGold.flatMap((entry) => {
    const expected = gold.get(entry.caseID);
    const unseen = [...(expected?.relevant ?? [])].filter((itemID) => !expected?.delivered.has(itemID));
    const reached = new Set(shown(entry));

    return unseen.length === 0 ? [] : [unseen.filter((itemID) => reached.has(itemID)).length / unseen.length];
  });

  const served = labelled.flatMap((entry) => shown(entry).map((itemID) => gold.get(entry.caseID)?.relevant.has(itemID) === true));

  const noise = ranked.flatMap((entry) => shown(entry).filter((itemID) => gold.get(entry.caseID)?.noise.has(itemID) === true));

  return {
    goldCases: withGold.length,
    coveredRecall: round(average(covered)),
    freshCases: fresh.length,
    freshRecall: round(average(fresh)),
    emptyCases: empty.length,
    shownOnEmpty: round(average(empty.map((entry) => shown(entry).length))),
    emptyWithAny: round(average(empty.map((entry) => (shown(entry).length > 0 ? 1 : 0)))),
    precision: round(average(served.map((isGold) => (isGold ? 1 : 0)))),
    noiseServed: noise.length,
  };
}

function average(numbers: number[]): number {
  return numbers.length === 0 ? 0 : numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
