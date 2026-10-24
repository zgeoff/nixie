import { expect, mock, test } from 'bun:test';
import { readRecords, runProjectionRebuild } from '@heynixie/log';
import { createMemoryItem } from './test-utils/create-memory-item';
import { createProposal } from './test-utils/create-proposal';
import { readMemoryRows } from './test-utils/read-memory-rows';
import { startFaultPointHold } from './test-utils/start-fault-point-hold';
import { startTestMemory } from './test-utils/start-test-memory';
import type { CleanupSessions, MemoryTables } from './types';

async function setupTest() {
  const cleanupSessions = mock<CleanupSessions>(() => Promise.resolve());

  const memory = await startTestMemory({ cleanupSessions });

  return { memory, cleanupSessions, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it forgets every active and retired item, and leaves each reading as forgotten', async () => {
  const ctx = await setupTest();
  const active = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });
  const retired = await createMemoryItem(ctx.memory.store, { text: 'Rows on Sunday mornings' });

  await ctx.memory.store.retire({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forgotten = await ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const histories = await Promise.all(
    [active, retired].map((item) => ctx.memory.store.readHistory(item.itemID)),
  );

  expect(forgotten).toStrictEqual([active.itemID, retired.itemID]);

  expect(histories).toMatchObject([
    { state: 'forgotten', versions: [{ status: 'shredded' }] },
    { state: 'forgotten', versions: [{ status: 'shredded' }, { status: 'shredded' }] },
  ]);

  expect(ctx.cleanupSessions.mock.calls).toStrictEqual([
    [{ itemID: active.itemID }],
    [{ itemID: retired.itemID }],
  ]);
});

test('it leaves out an item that an earlier forget took', async () => {
  const ctx = await setupTest();
  const earlier = await createMemoryItem(ctx.memory.store, { text: 'Hums while cooking' });
  const later = await createMemoryItem(ctx.memory.store, { text: 'Owns a green kayak' });

  await ctx.memory.store.forget({
    target: earlier,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forgotten = await ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  expect(forgotten).toStrictEqual([later.itemID]);
});

test('it forgets the item and the version that writes queued ahead of it add', async () => {
  const ctx = await setupTest();
  const edited = await createMemoryItem(ctx.memory.store, { text: 'Drinks tea at noon' });

  const hold = startFaultPointHold('memory.recall.checked');
  const recall = ctx.memory.store.recall({ itemIDs: [edited.itemID] });

  await hold.reached;

  const edit = ctx.memory.store.remember({
    text: 'Drinks tea at four',
    target: edited,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const added = ctx.memory.store.remember({
    text: 'Swims in the lake each May',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forgotten = ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  hold.release();

  const [addedRef, itemIDs] = await Promise.all([added, forgotten, recall, edit]);
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  const started = records
    .map((entry) => entry.record)
    .filter((record) => record.kind === 'memory.forget_started')
    .map((record) => record.payload);

  expect(itemIDs).toStrictEqual([edited.itemID, addedRef.itemID]);

  expect(started).toMatchObject([
    { itemID: edited.itemID, version: 2 },
    { itemID: addedRef.itemID, version: 1 },
  ]);
});

test('it leaves a pending proposal pending and readable', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Plays the cello badly' });
  const proposal = await createProposal(ctx.memory.store, { text: 'Grows chillies indoors' });

  const forgotten = await ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(forgotten).toStrictEqual([item.itemID]);
  expect(pending).toStrictEqual([proposal]);
  expect(pending[0]?.text).toBe('Grows chillies indoors');
});

test('it forgets nothing and runs no session cleanup when memory holds no item', async () => {
  const ctx = await setupTest();

  const forgotten = await ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  expect(forgotten).toStrictEqual([]);
  expect(ctx.cleanupSessions).not.toHaveBeenCalled();
});

test('it rebuilds the rows after a forget of every item equal to the live rows', async () => {
  const ctx = await setupTest();

  await createMemoryItem(ctx.memory.store, { text: 'Bakes rye bread on Fridays' });

  const retired = await createMemoryItem(ctx.memory.store, { text: 'Collects old maps' });

  await ctx.memory.store.retire({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const live = await readMemoryRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMemoryRows(ctx.db);

  expect(live.items.map((row) => row.state)).toStrictEqual(['forgotten', 'forgotten']);
  expect(rebuilt).toStrictEqual(live);
});
