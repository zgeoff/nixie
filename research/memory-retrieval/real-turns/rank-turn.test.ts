import { expect, onTestFinished, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import { startMemoryIndex } from '../../../modules/memory/src/start-memory-index.ts';
import { buildRanker, SHIPPED } from './rank-turn.ts';
import { buildRuns } from './score-turns.ts';

async function setupTest() {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const ranker = buildRanker({ encode: async (texts) => texts.map(() => new Float32Array([1, 0])) }, index);

  return { ranker };
}

test('it orders vector matches by similarity and drops the one under the similarity floor', async () => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    'garden beds': new Float32Array([1, 0]),
    'Grows basil': new Float32Array([0.6, 0.8]),
    'Grows tomatoes': new Float32Array([0.9, 0.436]),
    'Owns a bike': new Float32Array([0.3, 0.954]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0])) },
    index,
  );

  const ranking = await ranker.rankTurn(
    {
      caseID: 't1',
      stepSequence: 1,
      recalledSequence: 2,
      recordedAt: 0,
      query: 'garden beds',
      typedQuery: 'garden beds',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-basil', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows basil' },
        { itemID: 'item-bike', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Owns a bike' },
        { itemID: 'item-tomato', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows tomatoes' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, mode: 'vector', isInt8: false },
    [],
  );

  expect(ranking).toStrictEqual({ facts: ['item-tomato', 'item-basil'], selves: [] });
});

test('it leaves out the version the session was given and keeps a newer one', async () => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    'garden beds': new Float32Array([1, 0]),
    'Grows basil': new Float32Array([0.6, 0.8]),
    'Grows tomatoes': new Float32Array([0.9, 0.436]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0])) },
    index,
  );

  const ranking = await ranker.rankTurn(
    {
      caseID: 't1',
      stepSequence: 1,
      recalledSequence: 2,
      recordedAt: 0,
      query: 'garden beds',
      typedQuery: 'garden beds',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-basil', version: 2, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows basil' },
        { itemID: 'item-tomato', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows tomatoes' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: ['item-tomato@1', 'item-basil@1'],
      ratings: [],
    },
    { ...SHIPPED, mode: 'vector', isInt8: false },
    [],
  );

  expect(ranking).toStrictEqual({ facts: ['item-basil'], selves: [] });
});

test('it keeps a keyword match that the similarity floor drops in a hybrid ranking', async () => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    'bike repair': new Float32Array([1, 0]),
    'Grows tomatoes': new Float32Array([0.9, 0.436]),
    'Owns a bike': new Float32Array([0.3, 0.954]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0])) },
    index,
  );

  const ranking = await ranker.rankTurn(
    {
      caseID: 't1',
      stepSequence: 1,
      recalledSequence: 2,
      recordedAt: 0,
      query: 'bike repair',
      typedQuery: 'bike repair',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-bike', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Owns a bike' },
        { itemID: 'item-tomato', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows tomatoes' },
        { itemID: 'item-dog', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Walks the dog' },
        { itemID: 'item-pasta', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Cooks pasta' },
        { itemID: 'item-night', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Reads at night' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, isInt8: false },
    [],
  );

  expect(ranking.facts.toSorted()).toStrictEqual(['item-bike', 'item-tomato']);
});

test('it drops a keyword match under the similarity floor and keeps a vector match, when keyword-only items are dropped', async () => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    'bike repair': new Float32Array([1, 0]),
    'Grows tomatoes': new Float32Array([0.9, 0.436]),
    'Owns a bike': new Float32Array([0.3, 0.954]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0])) },
    index,
  );

  const ranking = await ranker.rankTurn(
    {
      caseID: 't1',
      stepSequence: 1,
      recalledSequence: 2,
      recordedAt: 0,
      query: 'bike repair',
      typedQuery: 'bike repair',
      shownMessages: [],
      isSessionStart: false,
      sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-bike', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Owns a bike' },
        { itemID: 'item-tomato', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows tomatoes' },
        { itemID: 'item-dog', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Walks the dog' },
        { itemID: 'item-pasta', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Cooks pasta' },
        { itemID: 'item-night', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Reads at night' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, isInt8: false, isKeywordOnlyDropped: true },
    [],
  );

  expect(ranking.facts).toStrictEqual(['item-tomato']);
});

test('it leaves out an item marked sensitive', async () => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    'garden beds': new Float32Array([1, 0]),
    'Grows basil': new Float32Array([0.6, 0.8]),
    'Grows tomatoes': new Float32Array([0.9, 0.436]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0])) },
    index,
  );

  const ranking = await ranker.rankTurn(
    {
      caseID: 't1',
      stepSequence: 1,
      recalledSequence: 2,
      recordedAt: 0,
      query: 'garden beds',
      typedQuery: 'garden beds',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-basil', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows basil' },
        { itemID: 'item-tomato', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: true, text: 'Grows tomatoes' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, mode: 'vector', isInt8: false },
    [],
  );

  expect(ranking).toStrictEqual({ facts: ['item-basil'], selves: [] });
});

test('it shows nothing for a short message under the skip rule', async () => {
  const ctx = await setupTest();

  const ranking = await ctx.ranker.rankTurn(
    {
      caseID: 't1',
      stepSequence: 1,
      recalledSequence: 2,
      recordedAt: 0,
      query: 'thanks!',
      typedQuery: 'thanks!',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-thanks', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Says thanks a lot' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, isInt8: false, shortRule: { kind: 'skip', maxWords: 3 } },
    [],
  );

  expect(ranking).toStrictEqual({ facts: [], selves: [] });
});

test.each([
  ['keeps only the item both lists hold under the agree rule', { kind: 'agree', maxWords: 3 } as const, ['item-bike']],
  ['keeps the items of either list under no short rule', { kind: 'none' } as const, ['item-bike', 'item-tomato']],
])('it %s', async (_, shortRule, expected) => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    'bike repair': new Float32Array([1, 0]),
    'Grows tomatoes': new Float32Array([0.9, 0.436]),
    'Owns a bike': new Float32Array([0.8, 0.6]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0])) },
    index,
  );

  const ranking = await ranker.rankTurn(
    {
      caseID: 't1',
      stepSequence: 1,
      recalledSequence: 2,
      recordedAt: 0,
      query: 'bike repair',
      typedQuery: 'bike repair',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-bike', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Owns a bike' },
        { itemID: 'item-tomato', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows tomatoes' },
        { itemID: 'item-dog', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Walks the dog' },
        { itemID: 'item-pasta', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Cooks pasta' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, isInt8: false, shortRule },
    [],
  );

  expect(ranking.facts.toSorted()).toStrictEqual(expected);
});

test('it ranks every item of the store in a ranking run', async () => {
  const ctx = await setupTest();
  const hybrid = buildRuns(['leaf-ir-q8']).find((run) => run.name === 'leaf-ir-q8 hybrid');

  if (hybrid === undefined) {
    throw new Error('the shipped ranking run is missing');
  }

  const ranking = await ctx.ranker.rankTurn(
    {
      caseID: 't1',
      stepSequence: 1,
      recalledSequence: 2,
      recordedAt: 0,
      query: 'garden tomatoes',
      typedQuery: 'garden tomatoes',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: Array.from({ length: 12 }, (_, position) => ({
        itemID: `item-${position + 1}`,
        version: 1,
        isSelf: false,
        isPinned: false,
        isLapsed: false,
        isSensitive: false,
        text: `The garden bed ${position + 1} grows tomatoes`,
      })),
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    hybrid.config,
    [],
  );

  expect(ranking.facts).toHaveLength(12);
});

test.each([
  ['no correction', { kind: 'none' }, ['item-vague', 'item-tomato']],
  ['a hub penalty', { kind: 'penalty', weight: 1 }, ['item-tomato', 'item-vague']],
  ['a hub floor', { kind: 'floor', margin: 0.55 }, ['item-tomato']],
] as const)('it ranks an item near earlier messages under %s', async (_name, hub, expected) => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    'garden beds': new Float32Array([1, 0, 0]),
    'Feels fine': new Float32Array([0.92, 0, 0.392]),
    'Grows tomatoes': new Float32Array([0.9, 0.436, 0]),
    'all good': new Float32Array([0, 0, 1]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0, 0])) },
    index,
    [{ sequence: 1, text: 'all good' }],
  );

  const ranking = await ranker.rankTurn(
    {
      caseID: 't3',
      stepSequence: 2,
      recalledSequence: 3,
      recordedAt: 0,
      query: 'garden beds',
      typedQuery: 'garden beds',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-vague', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Feels fine' },
        { itemID: 'item-tomato', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows tomatoes' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, mode: 'vector', isInt8: false, hub },
    [],
  );

  expect(ranking.facts).toStrictEqual([...expected]);
});

test('it leaves out the messages after the turn from the hub score', async () => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    'garden beds': new Float32Array([1, 0, 0]),
    'Feels fine': new Float32Array([0.92, 0, 0.392]),
    'Grows tomatoes': new Float32Array([0.9, 0.436, 0]),
    'all good': new Float32Array([0, 0, 1]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0, 0])) },
    index,
    [{ sequence: 5, text: 'all good' }],
  );

  const ranking = await ranker.rankTurn(
    {
      caseID: 't3',
      stepSequence: 2,
      recalledSequence: 3,
      recordedAt: 0,
      query: 'garden beds',
      typedQuery: 'garden beds',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-vague', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Feels fine' },
        { itemID: 'item-tomato', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows tomatoes' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, mode: 'vector', isInt8: false, hub: { kind: 'penalty', weight: 1 } },
    [],
  );

  expect(ranking.facts).toStrictEqual(['item-vague', 'item-tomato']);
});

test('it scores the hub again for a ranking of the same turn at another vector width', async () => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    'harbour ferry': new Float32Array([1, 0, 0]),
    'Takes the early ferry': new Float32Array([0.6, 0, 0.8]),
    'all good': new Float32Array([0, 0, 1]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0, 0])) },
    index,
    [{ sequence: 1, text: 'all good' }],
  );
  const turn = {
    caseID: 't5',
    stepSequence: 4,
    recalledSequence: 5,
    recordedAt: 0,
    query: 'harbour ferry',
    typedQuery: 'harbour ferry',
    shownMessages: [],
    isSessionStart: false, sessionNumber: 0,
    isShredded: false,
    contextTokens: null,
    reply: '',
    earlier: [],
    candidates: [{ itemID: 'item-ferry', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Takes the early ferry' }],
    logged: [],
    searchMode: 'hybrid' as const,
    delivered: [],
    ratings: [],
  };
  const config = { ...SHIPPED, mode: 'vector' as const, isInt8: false, hub: { kind: 'floor' as const, margin: 0.25 } };

  await ranker.rankTurn(turn, { ...config, width: null }, []);

  const ranking = await ranker.rankTurn(turn, { ...config, width: 2 }, []);

  expect(ranking.facts).toStrictEqual(['item-ferry']);
});

test('it drops an item only BM25 found when BM25 has no weight', async () => {
  const ctx = await setupTest();

  const ranking = await ctx.ranker.rankTurn(
    {
      caseID: 't4',
      stepSequence: 3,
      recalledSequence: 4,
      recordedAt: 0,
      query: 'basil',
      typedQuery: 'basil',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-basil', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows basil' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, minSimilarity: 2, keywordWeight: 0 },
    [],
  );

  expect(ranking.facts).toStrictEqual([]);
});

test.each([
  [2, ['item-basil', 'item-bike']],
  [0.5, ['item-bike', 'item-basil']],
])('it ranks the BM25 match against the vector match by a BM25 weight of %p', async (keywordWeight, expected) => {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  const vectors: Record<string, Float32Array> = {
    basil: new Float32Array([1, 0]),
    'Grows basil': new Float32Array([0, 1]),
    'Owns a bike': new Float32Array([1, 0]),
  };
  const ranker = buildRanker(
    { encode: async (texts) => texts.map((text) => vectors[text] ?? new Float32Array([0, 0])) },
    index,
  );

  const ranking = await ranker.rankTurn(
    {
      caseID: 't4',
      stepSequence: 3,
      recalledSequence: 4,
      recordedAt: 0,
      query: 'basil',
      typedQuery: 'basil',
      shownMessages: [],
      isSessionStart: false, sessionNumber: 0,
      isShredded: false,
      contextTokens: null,
      reply: '',
      earlier: [],
      candidates: [
        { itemID: 'item-basil', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Grows basil' },
        { itemID: 'item-bike', version: 1, isSelf: false, isPinned: false, isLapsed: false, isSensitive: false, text: 'Owns a bike' },
      ],
      logged: [],
      searchMode: 'hybrid',
      delivered: [],
      ratings: [],
    },
    { ...SHIPPED, isInt8: false, minScore: 0, keywordWeight },
    [],
  );

  expect(ranking.facts).toStrictEqual(expected);
});
