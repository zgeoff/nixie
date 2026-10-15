import { expect, test } from 'bun:test';
import type { MemoryTables } from '../types';
import { readItemShortID } from './read-item-short-id';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it reads the short ID the items table holds for an item', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.db
    .updateTable('memory_items')
    .set({ short_id: 'k3x9m2p7qa' })
    .where('item_id', '=', item.itemID)
    .execute();

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  expect(shortID).toBe('k3x9m2p7qa');
});

test('it fails for an item that holds no short ID', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.db
    .updateTable('memory_items')
    .set({ short_id: null })
    .where('item_id', '=', item.itemID)
    .execute();

  const read = readItemShortID(ctx.memory.log, item.itemID);

  await read.catch(() => {});

  expect(read).rejects.toThrowWithMessage(Error, `memory item ${item.itemID} holds no short ID`);
});

test('it fails for an item ID that names no item', async () => {
  const ctx = await setupTest();

  const read = readItemShortID(ctx.memory.log, '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01');

  await read.catch(() => {});

  expect(read).rejects.toThrow();
});
