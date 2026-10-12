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

  const found = await ctx.index.findItemIDs('Sundays library', 10);

  expect(found).toStrictEqual(['item-b', 'item-a']);
});

test('it reads every character of a query as a word, never as search syntax', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Prefers window seats' }]);

  const found = await ctx.index.findItemIDs('"window" AND (NEAR* seats:', 10);

  expect(found).toStrictEqual(['item-a']);
});

test('it finds nothing for a query with no word in it', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Prefers window seats' }]);

  const result = await ctx.index.findItemIDs('?! --', 10);

  expect(result).toStrictEqual([]);
});

test('it replaces the entry of an item that changed', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Lives on Elm Street' }]);
  await ctx.index.update({ itemID: 'item-a', text: 'Lives on Oak Avenue' });

  const [old, current] = await Promise.all([
    ctx.index.findItemIDs('Elm', 10),
    ctx.index.findItemIDs('Oak', 10),
  ]);

  expect(old).toStrictEqual([]);
  expect(current).toStrictEqual(['item-a']);
});

test('it removes an item', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Lives on Elm Street' }]);
  await ctx.index.remove('item-a');

  const result = await ctx.index.findItemIDs('Elm', 10);

  expect(result).toStrictEqual([]);
});

test('it empties the index before it fills it again', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([{ itemID: 'item-a', text: 'Lives on Elm Street' }]);
  await ctx.index.updateAll([{ itemID: 'item-b', text: 'Works on Elm Street' }]);

  const result = await ctx.index.findItemIDs('Elm', 10);

  expect(result).toStrictEqual(['item-b']);
});
