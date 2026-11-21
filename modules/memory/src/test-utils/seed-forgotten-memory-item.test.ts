import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { MemoryTables } from '../types';
import { seedForgottenMemoryItem } from './seed-forgotten-memory-item';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const clock = createFakeClock({ startMs: Date.parse('2026-11-02T09:00:00Z') });

  const memory = await startTestMemory({ gate: { clock } });

  const deps = { store: memory.store, log: memory.log, clock };

  return { ...deps, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it leaves the item in the forgotten state', async () => {
  const ctx = await setupTest();
  const item = await seedForgottenMemoryItem(ctx);

  const row = await ctx.db
    .selectFrom('memory_items')
    .select(['item_id', 'state'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ item_id: item.itemID, state: 'forgotten' });
});

// the forget removes the item's key, so its text no longer reads back: the test checks the
// overrides that outlive it
test('it applies the origin and source overrides to a forgotten item', async () => {
  const ctx = await setupTest();

  const item = await seedForgottenMemoryItem(ctx, {
    origin: 'conversation',
    source: 'untrusted',
  });

  const history = await ctx.store.readHistory(item.itemID);

  expect(history?.versions[0]).toMatchObject({
    origin: 'conversation',
    source: 'untrusted',
    status: 'shredded',
  });
});
