import { expect, test } from 'bun:test';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.withTables<MemoryTables>() };
}

test('it pins an active item without adding a version', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select(['version', 'is_pinned', 'pinned_sequence'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ version: 1, is_pinned: 1, pinned_sequence: 2 });
});

test('it unpins an item', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: false,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select(['is_pinned', 'pinned_sequence'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ is_pinned: 0, pinned_sequence: null });
});

test('it rejects a pin of a retired item', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pin = ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await pin.catch(() => {});

  expect(pin).rejects.toMatchObject({ code: 'WRONG_STATE' });
});

test('it rejects a pin of an item that does not exist', async () => {
  const ctx = await setupTest();

  const pin = ctx.memory.store.pin({
    itemID: 'no-such-item',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await pin.catch(() => {});

  expect(pin).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
