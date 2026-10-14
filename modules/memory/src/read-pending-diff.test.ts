import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { findRecordKeys, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import type { ConsolidationTables } from './consolidation-types';
import { decodeConsolidationSummary } from './decode-consolidation-summary';
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

test('it stores the summary sealed, so the raw store holds no word of it', async () => {
  const ctx = await setupTest();
  const [oat, black] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [],
    summary: {
      text: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
      itemIDs: [oat.itemID, black.itemID],
    },
    now: ctx.clock.now(),
  });

  const db = ctx.memory.log.writer.db.$extendTables<ConsolidationTables & LogTables>();
  const runs = await db.selectFrom('memory_consolidations').selectAll().execute();
  const records = await db.selectFrom('records').selectAll().execute();

  expect(diff.summary?.text).toBe(
    'Two items conflict and stay unchanged: one says oat milk, the other says black.',
  );
  expect(runs).toMatchObject([
    { summary: expect.toBeString(), summary_shares: expect.toBeString() },
  ]);
  expect(JSON.stringify(runs)).not.toInclude('oat milk');
  expect(JSON.stringify(records)).not.toInclude('oat milk');
});

test('it erases the summary once an item it names is forgotten, and keeps the changes', async () => {
  const ctx = await setupTest();
  const [oat, black, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
  ]);

  await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' }],
    summary: {
      text: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
      itemIDs: [oat.itemID, black.itemID, trip.itemID],
    },
    now: ctx.clock.now(),
  });
  await ctx.memory.store.forget({
    target: oat,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending).toMatchObject({ changes: [{ kind: 'retire' }], summary: null });
});

test('it leaves a stored summary that no key left opens once an item it names is forgotten', async () => {
  const ctx = await setupTest();
  const [oat, black] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [],
    summary: { text: 'Two items about coffee conflict.', itemIDs: [oat.itemID, black.itemID] },
    now: ctx.clock.now(),
  });

  await ctx.memory.store.forget({
    target: oat,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const run = await ctx.memory.log.writer.db
    .$extendTables<ConsolidationTables>()
    .selectFrom('memory_consolidations')
    .selectAll()
    .executeTakeFirstOrThrow();
  const left = await findRecordKeys(ctx.memory.log, [oat.itemID, black.itemID]);

  // the key left also stands in the forgotten item's place
  const kept = left.get(black.itemID) ?? null;

  invariant(kept);
  expect([...left.keys()]).toStrictEqual([black.itemID]);
  expect(
    decodeConsolidationSummary(
      diff.diffID,
      { sealed: run.summary ?? '', shares: JSON.parse(run.summary_shares ?? '[]') },
      new Map([
        [oat.itemID, kept],
        [black.itemID, kept],
      ]),
    ),
  ).rejects.toThrow();
});

test('it shows no diff once a forget erases the summary of a run that proposed no change', async () => {
  const ctx = await setupTest();
  const [oat, black] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  await createConsolidationDiff(ctx.memory, {
    changes: [],
    summary: { text: 'Two items about coffee conflict.', itemIDs: [oat.itemID, black.itemID] },
    now: ctx.clock.now(),
  });
  await ctx.memory.store.forget({
    target: oat,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending).toBeNull();
});

test('it lets the summary of a run that proposed no change lapse at its lapse time', async () => {
  const ctx = await setupTest();
  const [oat, black] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  await createConsolidationDiff(ctx.memory, {
    changes: [],
    summary: { text: 'Two items about coffee conflict.', itemIDs: [oat.itemID, black.itemID] },
    now: ctx.clock.now(),
    lapseMs: 60_000,
  });
  ctx.clock.advance(60_000);

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending).toBeNull();
});

test("it shows only the last run's summary, never an older run's", async () => {
  const ctx = await setupTest();
  const [oat, black] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  await createConsolidationDiff(ctx.memory, {
    changes: [],
    summary: { text: 'Two items about coffee conflict.', itemIDs: [oat.itemID, black.itemID] },
    now: ctx.clock.now(),
  });
  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.consolidation_proposed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: {
        diffID: 'diff-later',
        at: ctx.clock.now(),
        model: null,
        shownItems: 2,
        changes: [],
      },
    },
  ]);

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending).toBeNull();
});
