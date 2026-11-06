import { expect, test } from 'bun:test';
import { createMemoryItem } from './create-memory-item';
import { readTestMemoryItems } from './read-test-memory-items';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it reads each item with its version and state, oldest first', async () => {
  const ctx = await setupTest();
  const kept = await createMemoryItem(ctx.memory.store, { text: 'Grows chillies' });
  const retired = await createMemoryItem(ctx.memory.store, { text: 'Rents a bike' });

  await ctx.memory.store.retire({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const items = await readTestMemoryItems(ctx.memory.writer);

  expect(items).toStrictEqual([
    { itemID: kept.itemID, version: 1, state: 'active' },
    { itemID: retired.itemID, version: 2, state: 'retired' },
  ]);
});
