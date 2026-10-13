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
    { itemID: 'item-c', text: 'The library on Elm Street closes early on Tuesday' },
    { itemID: 'item-d', text: 'Waters the ferns every Tuesday' },
  ]);

  // "Tuesday" sits in 3 of the 4 items, so it scores near 0, and "flowerpot" sits in one
  const found = await ctx.index.findItemIDs('Tuesday flowerpot', { limit: 10, minScore: 0.25 });

  expect(found).toStrictEqual(['item-a']);
});

test('it leaves the function words of a query out of the match', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'Allergic to hazelnuts and the cat' },
    { itemID: 'item-b', text: 'Has a sister called Priya who lives in Lisbon' },
    { itemID: 'item-c', text: 'Prefers window seats on trains' },
  ]);

  const found = await ctx.index.findItemIDs('I need to book a train to Manchester', { limit: 10 });

  expect(found).toStrictEqual(['item-c']);
});

test('it matches no item for a query of only function words', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'Allergic to hazelnuts and the cat' },
    { itemID: 'item-b', text: 'Has a sister called Priya who lives in Lisbon' },
  ]);

  const found = await ctx.index.findItemIDs("Who is it that's in there?", { limit: 10 });

  expect(found).toStrictEqual([]);
});

test('it never matches a function word in an item to a query word that stems to it', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'The dentist is on Tuesday at nine' },
    { itemID: 'item-b', text: 'Keeps one spare charger in the car' },
    { itemID: 'item-c', text: 'Works from home on Mondays' },
  ]);

  // porter stems "one" to "on", which item-a and item-c hold only as a function word
  const found = await ctx.index.findItemIDs('one sec', { limit: 10 });

  expect(found).toStrictEqual(['item-b']);
});

test('it matches an item with a decomposed accent to a query with the composed accent', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'Has a sister who lives in München' },
    { itemID: 'item-b', text: 'Allergic to hazelnuts and the cat' },
    { itemID: 'item-c', text: 'Prefers window seats on trains' },
  ]);

  // item-a spells "München" with "u" and a combining diaeresis, and the query with the composed "ü"
  const found = await ctx.index.findItemIDs('München', { limit: 10, minScore: 0.25 });

  expect(found).toStrictEqual(['item-a']);
});

test('it drops every match in an index of 2 items, which BM25 scores near 0', async () => {
  const ctx = await setupTest();

  await ctx.index.updateAll([
    { itemID: 'item-a', text: 'The spare key sits under the blue flowerpot' },
    { itemID: 'item-b', text: 'The dentist appointment is on Tuesday at nine' },
  ]);

  const found = await ctx.index.findItemIDs('flowerpot', { limit: 10, minScore: 0.25 });

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
    { itemID: 'item-a', text: 'The spare key sits under the blue flowerpot on Tuesday' },
    { itemID: 'item-b', text: 'The dentist appointment is on Tuesday at nine' },
  ]);

  const found = await ctx.index.findItemIDs('Tuesday', { limit: 10 });

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
