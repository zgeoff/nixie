import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildStubEncoder } from '../test-utils/build-stub-encoder';
import type { SemanticSearch } from '../types';
import { startTriggerIndex } from './start-trigger-index';

async function setupTest(semantic?: SemanticSearch) {
  const triggers = await startTriggerIndex(semantic);

  onTestFinished(() => triggers.stop());

  const options = { limit: 10, minScore: 0, excludedIDs: [], excludedWords: [] };

  return { triggers, options };
}

test('it returns one match for an item whose phrases both match', async () => {
  const ctx = await setupTest();

  await ctx.triggers.updateAll(
    new Map([
      ['item-piano', ['piano tuning', 'tuning fork']],
      ['item-bins', ['bin day']],
    ]),
  );

  const result = await ctx.triggers.readMatches('piano tuning fork', ctx.options);

  expect(result).toStrictEqual({
    matches: [{ itemID: 'item-piano', score: expect.toBeNumber() }],
    searchMode: 'keyword',
  });
});

test('it keeps the best phrase of an item so its other phrases never fill the limit', async () => {
  const ctx = await setupTest();

  await ctx.triggers.updateAll(
    new Map([
      ['item-piano', ['piano one', 'piano two', 'piano three']],
      ['item-organ', ['piano organ']],
    ]),
  );

  const result = await ctx.triggers.readMatches('piano', { ...ctx.options, limit: 2 });

  expect(result.matches.map((match) => match.itemID).toSorted()).toStrictEqual([
    'item-organ',
    'item-piano',
  ]);
});

test('it replaces the old phrases of an item when it sets new ones', async () => {
  const ctx = await setupTest();

  await ctx.triggers.set('item-piano', ['piano tuning']);
  await ctx.triggers.set('item-piano', ['organ pedals']);

  const [old, current] = await Promise.all([
    ctx.triggers.readMatches('piano', ctx.options),
    ctx.triggers.readMatches('organ', ctx.options),
  ]);

  expect({
    old: old.matches,
    current: current.matches.map((match) => match.itemID),
  }).toStrictEqual({
    old: [],
    current: ['item-piano'],
  });
});

test('it drops the phrases of an item it removes', async () => {
  const ctx = await setupTest();

  await ctx.triggers.set('item-piano', ['piano tuning']);
  await ctx.triggers.remove('item-piano');

  const result = await ctx.triggers.readMatches('piano', ctx.options);

  expect(result.matches).toStrictEqual([]);
});

test('it leaves out the items it is told to exclude', async () => {
  const ctx = await setupTest();

  await ctx.triggers.set('item-piano', ['piano tuning']);
  await ctx.triggers.set('item-organ', ['piano organ']);

  const result = await ctx.triggers.readMatches('piano', {
    ...ctx.options,
    excludedIDs: ['item-piano'],
  });

  expect(result.matches.map((match) => match.itemID)).toStrictEqual(['item-organ']);
});

test('it leaves a match below the floor out', async () => {
  const ctx = await setupTest();

  await ctx.triggers.set('item-piano', ['piano tuning']);

  const result = await ctx.triggers.readMatches('piano', { ...ctx.options, minScore: 1000 });

  expect(result.matches).toStrictEqual([]);
});

test('it ignores a name word the caller excludes', async () => {
  const ctx = await setupTest();

  await ctx.triggers.set('item-name', ['Robin birthday']);

  const result = await ctx.triggers.readMatches('Robin', {
    ...ctx.options,
    excludedWords: ['Robin'],
  });

  expect(result.matches).toStrictEqual([]);
});

test('it matches a phrase by meaning through the encoder once the vectors are rebuilt', async () => {
  const ctx = await setupTest({
    encoder: buildStubEncoder([['sister', 'sibling']]),
    onError: mock<(error: unknown) => void>(),
  });

  const phrases = new Map([['item-family', ['my sister']]]);

  await ctx.triggers.updateAll(phrases);
  await ctx.triggers.rebuildVectors(phrases);

  const result = await ctx.triggers.readMatches('call my sibling', {
    ...ctx.options,
    minScore: 1000,
  });

  expect(result).toStrictEqual({
    matches: [{ itemID: 'item-family', similarity: expect.toBeNumber() }],
    searchMode: 'hybrid',
  });
});

test('it falls back to keywords and says so while the vectors are not rebuilt', async () => {
  const ctx = await setupTest({
    encoder: buildStubEncoder([['sister', 'sibling']]),
    onError: mock<(error: unknown) => void>(),
  });

  await ctx.triggers.set('item-family', ['my sister']);

  const result = await ctx.triggers.readMatches('sister', ctx.options);

  expect(result).toMatchObject({
    matches: [{ itemID: 'item-family' }],
    searchMode: 'keyword-fallback',
  });
});

test('it reports keyword-fallback when nothing matches while the vectors are not rebuilt', async () => {
  const ctx = await setupTest({
    encoder: buildStubEncoder([['sister', 'sibling']]),
    onError: mock<(error: unknown) => void>(),
  });

  await ctx.triggers.set('item-family', ['my sister']);

  const result = await ctx.triggers.readMatches('tractor', ctx.options);

  expect(result).toStrictEqual({ matches: [], searchMode: 'keyword-fallback' });
});
