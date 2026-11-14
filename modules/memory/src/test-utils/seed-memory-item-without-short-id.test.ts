import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import type { MemoryTables } from '../types';
import { seedMemoryItemWithoutShortID } from './seed-memory-item-without-short-id';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const deps = { store: memory.store, log: memory.log, clock };

  return { ...deps, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it leaves an active item whose row holds no short ID', async () => {
  const ctx = await setupTest();
  const item = await seedMemoryItemWithoutShortID(ctx);

  const row = await ctx.db
    .selectFrom('memory_items')
    .select(['item_id', 'state', 'short_id'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ item_id: item.itemID, state: 'active', short_id: null });
});

test('it applies the text and origin overrides to an item with no short ID', async () => {
  const ctx = await setupTest();

  const item = await seedMemoryItemWithoutShortID(ctx, {
    text: 'Keeps bees',
    origin: 'conversation',
  });

  const history = await ctx.store.readHistory(item.itemID);

  expect(history?.versions[0]).toMatchObject({ origin: 'conversation', text: 'Keeps bees' });
});
