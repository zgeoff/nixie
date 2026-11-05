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
import type { BackgroundMessage, RankConfig, TurnRanking } from './rank-turn.ts';
import { buildRanker, SHIPPED } from './rank-turn.ts';

// A label names items by the references local to its turn, and the sample key maps each reference
// to the item it stands for.
export const labelSchema = z.object({
  caseID: z.string(),
  relevant: z.array(z.string()),
  best: z.string().nullable(),
  by: z.enum(['assistant', 'owner', 'model']).exactOptional(),
  // What the rater says would have helped but the list left out, in the rater's words. Only the
  // count of these reaches a report: a mapping outside the repo turns each into item IDs.
  missing: z.array(z.string()).exactOptional(),
  // The references the rater says made the reply worse, a harder verdict than noise.
  misleading: z.array(z.string()).exactOptional(),
});

// The items each turn's missing descriptions name, matched by hand outside the repo, and the count
// of descriptions that named nothing in the store.
export const missingMapSchema = z.object({
  caseID: z.string(),
  itemIDs: z.array(z.string()),
  unmatched: z.int().nonnegative(),
});

export type MissingMap = z.infer<typeof missingMapSchema>;

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
    sweep('hybrid, hub penalty 0.5', 'ranking', { ...rankingBase, hub: { kind: 'penalty', weight: 0.5 } }),
    sweep('hybrid, hub penalty 1', 'ranking', { ...rankingBase, hub: { kind: 'penalty', weight: 1 } }),
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

  for (const keywordWeight of [0, 0.25, 0.5, 2]) {
    runs.push(
      sweep(`hybrid, BM25 x${keywordWeight}`, 'ranking', { ...rankingBase, keywordWeight }),
      sweep(`served, BM25 x${keywordWeight}`, 'served', { ...SHIPPED, keywordWeight }),
    );
  }

  for (const minScore of [0.5, 4]) {
    runs.push(sweep(`served, BM25 floor ${minScore}`, 'served', { ...SHIPPED, minScore }));
  }

  for (const hub of [
    { kind: 'penalty', weight: 0.5 },
    { kind: 'penalty', weight: 1 },
    { kind: 'floor', margin: -0.05 },
    { kind: 'floor', margin: 0 },
    { kind: 'floor', margin: 0.05 },
  ] as const) {
    runs.push(sweep(`served, hub ${hub.kind} ${'weight' in hub ? hub.weight : hub.margin}`, 'served', { ...SHIPPED, hub }));
  }

  runs.push(
    sweep('served, keyword-only items dropped', 'served', { ...SHIPPED, isKeywordOnlyDropped: true }),
    sweep('served, similarity 0.46, BM25 2, keyword-only items dropped', 'served', {
      ...SHIPPED,
      minSimilarity: 0.46,
      minScore: 2,
      isKeywordOnlyDropped: true,
    }),
  );

  for (const floors of [
    { name: 'shipped floors', minSimilarity: SHIPPED.minSimilarity, minScore: SHIPPED.minScore },
    { name: 'similarity 0.46, BM25 2', minSimilarity: 0.46, minScore: 2 },
    { name: 'similarity 0.46, BM25 4', minSimilarity: 0.46, minScore: 4 },
  ]) {
    const base = { ...SHIPPED, minSimilarity: floors.minSimilarity, minScore: floors.minScore, isSensitiveExcluded: false };

    runs.push(
      sweep(`served, ${floors.name}, sensitive shown`, 'served', base),
      sweep(`served, ${floors.name}, sensitive shown, keyword-only items dropped`, 'served', { ...base, isKeywordOnlyDropped: true }),
    );
  }

  for (const messages of [1, 2]) {
    runs.push(sweep(`served, window ${messages}`, 'served', { ...SHIPPED, shortRule: { kind: 'window', messages } }));
  }

  runs.push(
    sweep('served, previous exchange on every turn', 'served', {
      ...SHIPPED,
      shortRule: { kind: 'previous', maxWords: Number.POSITIVE_INFINITY },
    }),
  );

  runs.push(...buildShortRuns());

  return runs;
}

// The served sets that change what a short message, or pasted text, retrieves.
function buildShortRuns(): Run[] {
  const runs: Run[] = [];

  for (const maxWords of [3, 6]) {
    for (const kind of ['skip', 'previous', 'agree', 'vectors'] as const) {
      runs.push({
        name: `leaf-ir-q8 served, short ${kind}, ${maxWords} words`,
        encoder: 'leaf-ir-q8',
        kind: 'served',
        config: { ...SHIPPED, shortRule: { kind, maxWords } },
        isShipped: false,
      });
    }
  }

  runs.push({
    name: 'leaf-ir-q8 served, pasted text dropped',
    encoder: 'leaf-ir-q8',
    kind: 'served',
    config: { ...SHIPPED, isPastedDropped: true },
    isShipped: false,
  });

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
  background: BackgroundMessage[] = [],
): Promise<Map<string, RankedTurn[]>> {
  const results = new Map<string, RankedTurn[]>(runs.map((run) => [run.name, []]));

  for (const encoderName of [...new Set(runs.map((run) => run.encoder))]) {
    const encoder = await resources.loadEncoder(encoderName);
    const index = await resources.startIndex();
    const ranker = buildRanker(encoder, index, background);
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
  const scored = ranked.filter((entry) => collectRankable(gold.get(entry.caseID)).size > 0);

  const perCase = scored.map((entry) => {
    const expected = gold.get(entry.caseID);
    const list = entry.ranking.facts;
    const relevant = collectRankable(expected);
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

  const rankable = collectRankable(expected);

  if (rankable.size === 0) {
    return null;
  }

  if (metric === 'at5') {
    return list.slice(0, 5).filter((itemID) => rankable.has(itemID)).length / rankable.size;
  }

  const first = list.findIndex((itemID) => rankable.has(itemID));

  return first === -1 ? 0 : 1 / (first + 1);
}

function collectRankable(expected: Gold | undefined): Set<string> {
  return new Set([...(expected?.relevant ?? [])].filter((itemID) => expected?.pinned.has(itemID) !== true));
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
  alreadyHeld: number;
  noiseServed: number;
  misleadingServed: number;
}

export interface Gold {
  relevant: Set<string>;
  messages: Set<string>;
  best: string | null;
  noise: Set<string>;
  misleading: Set<string>;
  delivered: Set<string>;
  // A needed item that the turn's pinned core already shows: the store never ranks it.
  pinned: Set<string>;
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

  // An item the session already holds is neither help nor noise, in line with the session exclusion,
  // so precision counts only the items the turn brought anew.
  const brought = labelled.flatMap((entry) => {
    const expected = gold.get(entry.caseID);

    return shown(entry)
      .filter((itemID) => expected?.delivered.has(itemID) !== true)
      .map((itemID) => expected?.relevant.has(itemID) === true);
  });

  const broughtShown = (entry: RankedTurn) => shown(entry).filter((itemID) => gold.get(entry.caseID)?.delivered.has(itemID) !== true);
  const noise = ranked.flatMap((entry) => broughtShown(entry).filter((itemID) => gold.get(entry.caseID)?.noise.has(itemID) === true));
  const misleading = ranked.flatMap((entry) => broughtShown(entry).filter((itemID) => gold.get(entry.caseID)?.misleading.has(itemID) === true));

  return {
    goldCases: withGold.length,
    coveredRecall: round(average(covered)),
    freshCases: fresh.length,
    freshRecall: round(average(fresh)),
    emptyCases: empty.length,
    shownOnEmpty: round(average(empty.map((entry) => shown(entry).length))),
    emptyWithAny: round(average(empty.map((entry) => (shown(entry).length > 0 ? 1 : 0)))),
    precision: round(average(brought.map((isGold) => (isGold ? 1 : 0)))),
    alreadyHeld: labelled.reduce((sum, entry) => sum + shown(entry).length, 0) - brought.length,
    noiseServed: noise.length,
    misleadingServed: misleading.length,
  };
}

function average(numbers: number[]): number {
  return numbers.length === 0 ? 0 : numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
