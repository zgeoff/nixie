import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-12T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  return { memory, clock };
}

test('it reads no run and nothing pending before the first run', async () => {
  const ctx = await setupTest();
  const schedule = await ctx.memory.store.consolidations.readSchedule();

  expect(schedule).toStrictEqual({ lastRunAt: null, pending: 0, nextLapseAt: null });
});

test('it reads the last run on the task clock and the earliest lapse of a pending change', async () => {
  const ctx = await setupTest();
  const bees = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon' });

  await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [bees], reason: 'Stale.', source: 'owner' }],
    now: ctx.clock.now(),
    lapseMs: 60_000,
  });

  ctx.clock.advance(1000);

  await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [trip], reason: 'The trip ended.', source: 'owner' }],
    now: ctx.clock.now(),
    lapseMs: 60_000,
  });

  const schedule = await ctx.memory.store.consolidations.readSchedule();

  expect(schedule).toStrictEqual({
    lastRunAt: Date.parse('2026-10-12T09:00:01Z'),
    pending: 2,
    nextLapseAt: Date.parse('2026-10-12T09:01:00Z'),
  });
});
