import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it reads the short ID of each item by its item ID', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Keeps the spare key under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const row = await ctx.db
    .selectFrom('memory_items')
    .select('short_id')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  invariant(row.short_id !== null);

  const shortIDs = await ctx.memory.store.readShortIDs([item.itemID]);

  expect(shortIDs).toStrictEqual(new Map([[item.itemID, row.short_id]]));
});

test('it reads the short ID of a forgotten item', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Keeps the spare key under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortIDs = await ctx.memory.store.readShortIDs([item.itemID]);

  expect(shortIDs.get(item.itemID)).toMatch(/^[a-z][a-z0-9]{9}$/u);
});

test('it leaves out an item ID that names no item', async () => {
  const ctx = await setupTest();

  const shortIDs = await ctx.memory.store.readShortIDs(['0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01']);

  expect(shortIDs).toStrictEqual(new Map());
});
