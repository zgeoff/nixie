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
      isSessionStart: false,
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
      isSessionStart: false,
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
      isSessionStart: false,
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
      isSessionStart: false,
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
      isSessionStart: false,
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
      isSessionStart: false,
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
      isSessionStart: false,
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
