import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { MemoryTables } from '../types';
import { seedMemoryItem } from './seed-memory-item';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const clock = createFakeClock({ startMs: Date.parse('2026-11-02T09:00:00Z') });

  const memory = await startTestMemory({ gate: { clock } });

  const deps = { store: memory.store, log: memory.log, clock };

  return { ...deps, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it leaves an active item', async () => {
  const ctx = await setupTest();
  const item = await seedMemoryItem(ctx);

  const row = await ctx.db
    .selectFrom('memory_items')
    .select(['item_id', 'state'])
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ item_id: item.itemID, state: 'active' });
  expect(item.version).toBe(1);
});

test('it applies the text and origin overrides to an active item', async () => {
  const ctx = await setupTest();
  const item = await seedMemoryItem(ctx, { text: 'Keeps bees', origin: 'conversation' });
  const history = await ctx.store.readHistory(item.itemID);

  expect(history?.versions[0]).toMatchObject({ origin: 'conversation', text: 'Keeps bees' });
});
