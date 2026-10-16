import { expect, test } from 'bun:test';
import { readMockPinnedCore } from './read-mock-pinned-core';
import { store } from './store';

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

test('it leaves a pinned item that is no longer active out of the core', async () => {
  await store.memoryItems.create({
    isPinned: true,
    state: 'retired',
    versions: [{ state: 'retired', text: 'Is allergic to peanuts' }],
  });

  expect(readMockPinnedCore()).toStrictEqual({ budget: 2000, items: [], tokens: 0 });
});
