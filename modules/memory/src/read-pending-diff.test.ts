import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-12T09:00:00Z'));
  const memory = await startTestMemory({ gate: { clock } });

  return { memory, clock };
}

test('it reads no diff before the consolidator proposes one', async () => {
  const ctx = await setupTest();

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending).toBeNull();
});

test('it drops a change whose first input was forgotten, and keeps the rest', async () => {
  const ctx = await setupTest();
  const forgotten = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [forgotten], reason: 'Stale.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
    now: ctx.clock.now(),
  });
  const [, kept] = diff.changes;

  invariant(kept);
  await ctx.memory.store.forget({
    target: forgotten,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending?.changes.map((change) => change.changeID)).toStrictEqual([kept.changeID]);
});

test('it shows a later input as no longer current once it moved on', async () => {
  const ctx = await setupTest();
  const kept = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });
  const moved = await createMemoryItem(ctx.memory.store, { text: 'keeps bee' });

  await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [kept, moved],
        text: 'Keeps bees',
        reason: 'Both items say the same.',
        source: 'owner',
      },
    ],
    now: ctx.clock.now(),
  });
  await ctx.memory.store.retire({
    target: moved,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending?.changes[0]?.inputs).toStrictEqual([
    { ...kept, text: 'Keeps bees', isCurrent: true },
    { ...moved, text: 'keeps bee', isCurrent: false },
  ]);
});

test('it leaves out a change past its lapse time', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });

  await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
    now: ctx.clock.now(),
    lapseMs: 60_000,
  });
  ctx.clock.advance(60_000);

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending).toBeNull();
});
