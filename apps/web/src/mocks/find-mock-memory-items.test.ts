import { expect, test } from 'bun:test';
import { findMockMemoryItems } from './find-mock-memory-items';
import { store } from './store';

test('it finds an active item by a word in its text, whatever its case', async () => {
  const item = await store.memoryItems.create({
    versions: [{ text: 'Plays the Cello on Thursdays' }],
  });

  await store.memoryItems.create({ versions: [{ text: 'Drinks oat milk' }] });

  const found = findMockMemoryItems('cello');

  expect(found).toMatchObject({
    items: [{ itemID: item.itemID, score: 1 }],
    searchMode: 'keyword',
  });

  expect(found.items).toHaveLength(1);
});

test('it ranks the item that matches more words of the query first', async () => {
  const one = await store.memoryItems.create({ versions: [{ text: 'Plays the cello' }] });

  const both = await store.memoryItems.create({
    versions: [{ text: 'Plays the cello in a string quartet' }],
  });

  const found = findMockMemoryItems('cello quartet');

  expect(found.items.map((item) => item.itemID)).toStrictEqual([both.itemID, one.itemID]);
});

test('it searches the current text of active items only', async () => {
  await store.memoryItems.create({
    state: 'retired',
    versions: [{ state: 'retired', text: 'Plays the cello' }],
  });

  await store.memoryItems.create({
    versions: [{ text: 'Plays the cello' }, { change: 'edited', text: 'Plays the viola' }],
  });

  expect(findMockMemoryItems('cello').items).toStrictEqual([]);
});
