import { expect, test } from 'bun:test';
import { readMockPinnedCore } from './read-mock-pinned-core';
import { store } from './store';
import { writeMockMemoryChange } from './write-mock-memory-change';

test('it reads the pinned active items with a token for each 4 characters, against 2,000', async () => {
  const pinned = await store.memoryItems.create({
    isPinned: true,
    versions: [{ text: 'Is allergic to peanuts' }],
  });

  await store.memoryItems.create({ versions: [{ text: 'Drinks oat milk' }] });

  const core = readMockPinnedCore();

  expect(core).toMatchObject({ budget: 2000, items: [{ itemID: pinned.itemID }], tokens: 6 });
  expect(core.items).toHaveLength(1);
});

test('it reads the core in the order its items were pinned, not created', async () => {
  const first = await store.memoryItems.create({ versions: [{ text: 'Is allergic to peanuts' }] });
  const second = await store.memoryItems.create({ versions: [{ text: 'Drinks oat milk' }] });

  await writeMockMemoryChange({
    change: 'pin',
    clientActionID: '9d2f4b6a-1c3e-4a5b-8f7d-2e4c6a8b0d1f',
    isPinned: true,
    itemID: second.itemID,
    version: 1,
  });

  await writeMockMemoryChange({
    change: 'pin',
    clientActionID: '4e6a8c0b-2d4f-4b6c-9a1e-3f5b7d9c1e2a',
    isPinned: true,
    itemID: first.itemID,
    version: 1,
  });

  expect(readMockPinnedCore().items.map((item) => item.itemID)).toStrictEqual([
    second.itemID,
    first.itemID,
  ]);
});

test('it leaves a pinned item that is no longer active out of the core', async () => {
  await store.memoryItems.create({
    isPinned: true,
    state: 'retired',
    versions: [{ state: 'retired', text: 'Is allergic to peanuts' }],
  });

  expect(readMockPinnedCore()).toStrictEqual({ budget: 2000, items: [], tokens: 0 });
});
