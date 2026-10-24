// Scores rankings of the rebuilt turns against labels: recall@5, recall@10 and mean reciprocal rank
// on one ranking over every item with no floor, and, for the set a turn would be shown under each
// floor, the share of labelled items it covers and the items it shows on turns that need none.
import type { TurnCase } from './build-turn-cases.ts';
import type { EncoderDirs, EncoderName } from './load-turn-encoder.ts';
import { loadTurnEncoder } from './load-turn-encoder.ts';
import { makeRandom } from './make-random.ts';
import type { RankConfig, TurnRanking } from './rank-turn.ts';
import { SHIPPED, startRanker } from './rank-turn.ts';

export interface Label {
  caseID: string;
  relevant: string[];
  best: string | null;
}

export interface Run {
  name: string;
  encoder: EncoderName;
  kind: 'ranking' | 'served';
  config: RankConfig;
}

const rankingBase: RankConfig = {
  ...SHIPPED,
  minScore: 0,
  minSimilarity: -1,
  listLimit: 100,
  factLimit: 10,
  isSplit: false,
  isDeliveredExcluded: false,
};

export function buildRuns(encoders: EncoderName[]): Run[] {
  const runs: Run[] = [];

  // Only the shipped model is trained so that its first numbers carry the meaning, so the others
  // keep every number.
  for (const encoder of encoders) {
    const config = encoder === 'leaf-ir-q8' ? rankingBase : { ...rankingBase, width: null };

    runs.push(
      { name: `${encoder} hybrid`, encoder, kind: 'ranking', config },
      { name: `${encoder} vectors`, encoder, kind: 'ranking', config: { ...config, mode: 'vector' } },
    );
  }

  const shipped = encoders.includes('leaf-ir-q8') ? 'leaf-ir-q8' : encoders[0];

  if (shipped === undefined) {
    return runs;
  }

  runs.push(
    { name: 'BM25', encoder: shipped, kind: 'ranking', config: { ...rankingBase, mode: 'keyword' } },
    { name: `${shipped} hybrid, full width`, encoder: shipped, kind: 'ranking', config: { ...rankingBase, width: null, isInt8: false } },
    { name: `${shipped} hybrid, k 20`, encoder: shipped, kind: 'ranking', config: { ...rankingBase, fusionK: 20 } },
    { name: `${shipped} hybrid, vectors x2`, encoder: shipped, kind: 'ranking', config: { ...rankingBase, vectorWeight: 2 } },
  );

  runs.push({
    name: `${shipped} served, shipped floors, nothing delivered`,
    encoder: shipped,
    kind: 'served',
    config: { ...SHIPPED, isDeliveredExcluded: false },
  });

  for (const limit of [3, 4]) {
    runs.push({
      name: `${shipped} served, shipped floors, nothing delivered, ${limit} items`,
      encoder: shipped,
      kind: 'served',
      config: { ...SHIPPED, isDeliveredExcluded: false, factLimit: limit, listLimit: limit },
    });
  }

  for (const limit of [3, 4, 8]) {
    runs.push({
      name: `${shipped} served, shipped floors, ${limit} items`,
      encoder: shipped,
      kind: 'served',
      config: { ...SHIPPED, factLimit: limit, listLimit: limit },
    });
  }

  for (const minSimilarity of [0.3, 0.34, 0.38, 0.42, 0.46]) {
    for (const minScore of [0.25, 1, 2]) {
      runs.push({
        name: `${shipped} served, similarity ${minSimilarity}, BM25 ${minScore}`,
        encoder: shipped,
        kind: 'served',
        config: { ...SHIPPED, minSimilarity, minScore },
      });
    }

    runs.push({
      name: `${shipped} served vectors, similarity ${minSimilarity}`,
      encoder: shipped,
      kind: 'served',
      config: { ...SHIPPED, mode: 'vector', minSimilarity },
    });
  }

  return runs;
}

export interface RankedTurn {
  caseID: string;
  ranking: TurnRanking;
}

export async function runRankings(
  turns: TurnCase[],
  runs: Run[],
  dirs: EncoderDirs,
  excludedWords: string[],
): Promise<Map<string, RankedTurn[]>> {
  const results = new Map<string, RankedTurn[]>(runs.map((run) => [run.name, []]));

  for (const encoderName of [...new Set(runs.map((run) => run.encoder))]) {
    const encoder = await loadTurnEncoder(encoderName, dirs);
    const ranker = await startRanker(encoder);
    const own = runs.filter((run) => run.encoder === encoderName);

    for (const turn of turns) {
      for (const run of own) {
        const ranking = await ranker.rankTurn(turn, run.config, excludedWords);

        results.get(run.name)?.push({ caseID: turn.caseID, ranking });
      }
    }

    await ranker.stop();
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
