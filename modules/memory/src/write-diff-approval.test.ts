import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { readApprovalRecords } from './test-utils/read-approval-records';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it approves each change of the whole diff and leaves none pending', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });

  const [first, second] = diff.changes;

  invariant(first && second);

  const outcomes = await ctx.memory.store.consolidations.approveAll(
    diff.changes.map((change) => ({
      changeID: change.changeID,
      actionHash: change.actionHash,
      identityID: 'device-1',
    })),
  );

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(outcomes).toStrictEqual([
    { changeID: first.changeID, status: 'applied', versions: [{ ...stale, version: 2 }] },
    { changeID: second.changeID, status: 'applied', versions: [{ ...trip, version: 2 }] },
  ]);

  expect(pending).toBeNull();
});

test('it writes one approval record for each change of the whole diff', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });

  const [first, second] = diff.changes;

  invariant(first && second);

  await ctx.memory.store.consolidations.approveAll(
    diff.changes.map((change) => ({
      changeID: change.changeID,
      actionHash: change.actionHash,
      identityID: 'device-1',
    })),
  );

  const records = await Promise.all([
    readApprovalRecords(ctx.memory.log, {
      proposalID: first.changeID,
      itemID: stale.itemID,
      actionHash: first.actionHash,
    }),
    readApprovalRecords(ctx.memory.log, {
      proposalID: second.changeID,
      itemID: trip.itemID,
      actionHash: second.actionHash,
    }),
  ]);

  expect(records).toMatchObject([
    [{ kind: 'memory.consolidation_approved' }, { kind: 'memory.version_added' }],
    [{ kind: 'memory.consolidation_approved' }, { kind: 'memory.version_added' }],
  ]);
});

test('it reports a refused change with its code and still applies the changes after it', async () => {
  const ctx = await setupTest();
  const moved = await createMemoryItem(ctx.memory.store, { text: 'owner likes. tea green' });
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [moved],
        text: 'Likes green tea',
        reason: 'The wording was garbled.',
        source: 'owner',
      },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });

  const [first, second] = diff.changes;

  invariant(first && second);

  await ctx.memory.store.retire({
    target: moved,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcomes = await ctx.memory.store.consolidations.approveAll([
    { changeID: first.changeID, actionHash: first.actionHash, identityID: 'device-1' },
    { changeID: second.changeID, actionHash: second.actionHash, identityID: 'device-1' },
  ]);

  expect(outcomes).toStrictEqual([
    { changeID: first.changeID, status: 'refused', code: 'STALE_VERSION' },
    { changeID: second.changeID, status: 'applied', versions: [{ ...trip, version: 2 }] },
  ]);
});

test('it applies only the changes the answers name', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });
  const trip = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });

  const [first, second] = diff.changes;

  invariant(first && second);

  await ctx.memory.store.consolidations.approveAll([
    { changeID: second.changeID, actionHash: second.actionHash, identityID: 'device-1' },
  ]);

  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending?.changes.map((change) => change.changeID)).toStrictEqual([first.changeID]);
});
