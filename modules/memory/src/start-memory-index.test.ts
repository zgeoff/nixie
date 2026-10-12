import { expect, onTestFinished, test } from 'bun:test';
import { startMemoryIndex } from './start-memory-index';

async function setupTest() {
  const index = await startMemoryIndex();

  onTestFinished(() => index.stop());

  return { index };
}

test('it finds the items that match any word of a query, best match first', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'The library closes at six' },
    { itemID: 'item-b', text: 'The library on Elm Street closes at six on Sundays' },
    { itemID: 'item-c', text: 'Allergic to hazelnuts' },
  ]);

  const found = await ctx.index.findItemIDs('Sundays library', { limit: 10 });

  expect(found).toStrictEqual(['item-b', 'item-a']);
});

test('it drops a match whose score falls below the floor', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'The spare key sits under the blue flowerpot' },
    { itemID: 'item-b', text: 'The dentist appointment is on Tuesday at nine' },
    { itemID: 'item-c', text: 'The library on Elm Street closes at six on Sundays' },
    { itemID: 'item-d', text: 'Allergic to hazelnuts and the cat' },
  ]);

  // "the" sits in every item, so it scores near 0, and "flowerpot" sits in one
  const found = await ctx.index.findItemIDs('the flowerpot', { limit: 10, minScore: 0.25 });

  expect(found).toStrictEqual(['item-a']);
});

test('it keeps every match in an index of 2 items, which BM25 scores near 0', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'The spare key sits under the blue flowerpot' },
    { itemID: 'item-b', text: 'The dentist appointment is on Tuesday at nine' },
  ]);

  const found = await ctx.index.findItemIDs('flowerpot', { limit: 10, minScore: 0.25 });

  expect(found).toStrictEqual(['item-a']);
});

test('it applies the floor once the index holds 3 items', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'The spare key sits under the blue flowerpot' },
    { itemID: 'item-b', text: 'The dentist appointment is on Tuesday at nine' },
    { itemID: 'item-c', text: 'The library on Elm Street closes at six on Sundays' },
  ]);

  // "the" sits in every item, so it scores near 0
  const found = await ctx.index.findItemIDs('the', { limit: 10, minScore: 0.25 });

  expect(found).toStrictEqual([]);
});

test('it leaves the excluded items out before it applies the limit', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'The spare key' },
    { itemID: 'item-b', text: 'The spare key sits under the blue flowerpot' },
    { itemID: 'item-c', text: 'Allergic to hazelnuts' },
  ]);

  const found = await ctx.index.findItemIDs('spare key', { limit: 1, excludedIDs: ['item-a'] });

  expect(found).toStrictEqual(['item-b']);
});

test('it keeps every match with no floor', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'The spare key sits under the blue flowerpot' },
    { itemID: 'item-b', text: 'The dentist appointment is on Tuesday at nine' },
  ]);

  const found = await ctx.index.findItemIDs('the', { limit: 10 });

  expect(found).toIncludeSameMembers(['item-a', 'item-b']);
});

test('it reads every character of a query as a word, never as search syntax', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Prefers window seats' }]);

  const found = await ctx.index.findItemIDs('"window" AND (NEAR* seats:', { limit: 10 });

  expect(found).toStrictEqual(['item-a']);
});

test('it finds nothing for a query with no word in it', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Prefers window seats' }]);

  const result = await ctx.index.findItemIDs('?! --', { limit: 10 });

  expect(result).toStrictEqual([]);
});

test('it replaces the entry of an item that changed', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Lives on Elm Street' }]);
  await ctx.index.update({ itemID: 'item-a', text: 'Lives on Oak Avenue' });

  const [old, current] = await Promise.all([
    ctx.index.findItemIDs('Elm', { limit: 10 }),
    ctx.index.findItemIDs('Oak', { limit: 10 }),
  ]);

  expect(old).toStrictEqual([]);
  expect(current).toStrictEqual(['item-a']);
});

test('it removes an item', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Lives on Elm Street' }]);
  await ctx.index.remove('item-a');

  const result = await ctx.index.findItemIDs('Elm', { limit: 10 });

  expect(result).toStrictEqual([]);
});

test('it empties the index before it fills it again', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Lives on Elm Street' }]);
  await ctx.index.updateAll([{ itemID: 'item-b', text: 'Works on Elm Street' }]);

  const result = await ctx.index.findItemIDs('Elm', { limit: 10 });

  expect(result).toStrictEqual(['item-b']);
});
