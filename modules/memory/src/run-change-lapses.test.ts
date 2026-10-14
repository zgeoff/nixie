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

test('it lapses each pending change past its lapse time, and counts them', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });

  await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
    now: ctx.clock.now(),
    lapseMs: 60_000,
  });
  ctx.clock.advance(60_000);

  const lapsed = await ctx.memory.store.consolidations.lapse();
  const schedule = await ctx.memory.store.consolidations.readSchedule();

  expect(lapsed).toBe(1);
  expect(schedule.pending).toBe(0);
});

test('it lapses a change whose first input was forgotten before its lapse time', async () => {
  const ctx = await setupTest();
  const [forgotten, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Keeps bees' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon' }),
  ]);

  await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [forgotten], reason: 'Stale.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
    now: ctx.clock.now(),
    lapseMs: 60_000,
  });
  await ctx.memory.store.forget({
    target: forgotten,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const lapsed = await ctx.memory.store.consolidations.lapse();
  const schedule = await ctx.memory.store.consolidations.readSchedule();

  expect(lapsed).toBe(1);
  expect(schedule.pending).toBe(1);
});

test('it never lapses a change before its lapse time', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });

  await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
    now: ctx.clock.now(),
    lapseMs: 60_000,
  });
  ctx.clock.advance(59_999);

  const lapsed = await ctx.memory.store.consolidations.lapse();
  const schedule = await ctx.memory.store.consolidations.readSchedule();

  expect(lapsed).toBe(0);
  expect(schedule.pending).toBe(1);
});
