import { expect, test } from 'bun:test';
import { readMockMemoryPage } from './read-mock-memory-page';
import { store } from './store';

test('it lists the items of one state in the order the store created them', async () => {
  const first = await store.memoryItems.create({ versions: [{ text: 'Plays the cello' }] });

  await store.memoryItems.create({
    state: 'retired',
    versions: [{ state: 'retired', text: 'Rents a flat on Mill Lane' }],
  });

  const second = await store.memoryItems.create({ versions: [{ text: 'Drinks oat milk' }] });

  const page = readMockMemoryPage({ state: 'active' });

  expect(page?.items.map((item) => item.itemID)).toStrictEqual([first.itemID, second.itemID]);
  expect(page?.next).toBeNull();
});

test('it lists an item a forget began on the forgotten page', async () => {
  const item = await store.memoryItems.create({
    state: 'forgetting',
    versions: [{ text: 'Owes Robin twenty pounds' }],
  });

  const page = readMockMemoryPage({ state: 'forgotten' });

  expect(page?.items.map((listed) => listed.itemID)).toStrictEqual([item.itemID]);
});

test('it pages the items with the cursor the page before returned', async () => {
  await store.memoryItems.create({ versions: [{ text: 'Plays the cello' }] });

  const second = await store.memoryItems.create({ versions: [{ text: 'Drinks oat milk' }] });

  const opening = readMockMemoryPage({ state: 'active', limit: 1 });

  const following = readMockMemoryPage({
    state: 'active',
    limit: 1,
    after: opening?.next ?? undefined,
  });

  expect(opening?.next).toBe('1');
  expect(following?.items.map((item) => item.itemID)).toStrictEqual([second.itemID]);
});

test('it reads a cursor that no page returned as null', () => {
  expect(readMockMemoryPage({ state: 'active', after: 'page-two' })).toBeNull();
});
