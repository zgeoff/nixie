import { expect, test } from 'bun:test';
import { createMemoryItem } from './create-memory-item';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it writes an item as your own words by default', async () => {
  const ctx = await setupTest();

  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(item).toStrictEqual({ itemID: expect.any(String), version: 1 });
  expect(recalled.items).toMatchObject([
    { text: 'Keeps bees', origin: 'owner', source: 'owner', state: 'active' },
  ]);
});

test('it writes an item with the origin and source the request gives', async () => {
  const ctx = await setupTest();

  const item = await createMemoryItem(ctx.memory.store, {
    text: 'Keeps bees',
    origin: 'task',
    source: 'untrusted',
  });

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(recalled.items).toMatchObject([{ origin: 'task', source: 'untrusted' }]);
});
