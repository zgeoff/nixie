import { expect, test } from 'bun:test';
import { buildShortIDFromUUID } from '@heynixie/db';
import invariant from 'tiny-invariant';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it finds the item each short ID names', async () => {
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

  const found = await ctx.memory.store.findItemIDs([row.short_id]);

  expect(found).toStrictEqual(new Map([[row.short_id, item.itemID]]));
});

test('it finds an item by its item ID', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Keeps the spare key under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const found = await ctx.memory.store.findItemIDs([item.itemID]);

  expect(found).toStrictEqual(new Map([[item.itemID, item.itemID]]));
});

test('it finds an item that holds no short ID by the one its UUID gives', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Keeps the spare key under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  // an item that a release before short IDs made after the backfill holds none
  await ctx.db
    .updateTable('memory_items')
    .set({ short_id: null })
    .where('item_id', '=', item.itemID)
    .execute();

  const shortID = buildShortIDFromUUID(item.itemID);
  const found = await ctx.memory.store.findItemIDs([shortID]);

  expect(found).toStrictEqual(new Map([[shortID, item.itemID]]));
});

test('it leaves out an ID that names no item', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Keeps the spare key under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const found = await ctx.memory.store.findItemIDs(['z9z9z9z9z9']);

  expect(found).toStrictEqual(new Map());
});
