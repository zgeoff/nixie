import { expect, test } from 'bun:test';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it rebuilds the index from the active items at start', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const restarted = await startNextTestMemory(ctx.memory);
  const result = await restarted.store.recall({ query: 'flowerpot' });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
});

test('it leaves retired items out of the index it builds at start', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const restarted = await startNextTestMemory(ctx.memory);
  const result = await restarted.store.recall({ query: 'Elm', includeRetired: true });

  expect(result.items).toStrictEqual([]);
});

test('it starts on a log with no memory', async () => {
  const ctx = await setupTest();
  const result = await ctx.memory.store.recall({});

  expect(result).toStrictEqual({ items: [], next: null });
});
