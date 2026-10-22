import { expect, test } from 'bun:test';
import { createMemoryItem } from './test-utils/create-memory-item';
import { createProposal } from './test-utils/create-proposal';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it lists each retired item at its version with what its forget destroys, and leaves out active ones', async () => {
  const ctx = await setupTest();
  const kept = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const item = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  await createProposal(ctx.memory.store, { text: 'Plays the oboe well', target: item });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = await ctx.memory.store.view.readRetiredForgetPreview();

  expect(preview).toMatchObject({
    items: [
      {
        itemID: item.itemID,
        state: 'retired',
        version: retired.version,
        text: 'Plays the oboe badly',
        lost: { evidenceMessages: 0, proposals: 1 },
      },
    ],
    hasMore: false,
  });

  expect(preview.items.map((entry) => entry.itemID)).not.toContain(kept.itemID);
});

test('it lists at most 100 retired items and says more remain', async () => {
  const ctx = await setupTest();

  const items = await Promise.all(
    Array.from({ length: 101 }, (_, index) =>
      createMemoryItem(ctx.memory.store, { text: `Owns canoe number ${String(index)}` }),
    ),
  );

  await Promise.all(
    items.map((target) =>
      ctx.memory.store.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  const preview = await ctx.memory.store.view.readRetiredForgetPreview();

  expect(preview.items).toHaveLength(100);
  expect(preview.hasMore).toBeTrue();
}, 60_000);
