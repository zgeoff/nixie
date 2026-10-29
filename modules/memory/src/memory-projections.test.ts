import { expect, test } from 'bun:test';
import { runProjectionRebuild, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { readMemoryRows } from './test-utils/read-memory-rows';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it gives an item whose record holds no short ID the one its UUID gives, as the backfill does', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.version_added',
      definitions: { snapshotHash: 'sha256:test' },
      payload: {
        itemID: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13',
        version: 1,
        change: 'created',
        state: 'active',
        sealed: 'c2VhbGVk',
        evidence: null,
        intentEvidence: null,
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    },
  ]);

  const rows = await readMemoryRows(ctx.db);

  expect(rows.items).toMatchObject([
    { item_id: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', short_id: 'as2nducz6x' },
  ]);
});

test('it rebuilds an edited, retired and undone item equal to the live rows', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    evidenceQuote: 'my flat on Elm Street',
    evidence: { recordSequence: 4, start: 3, end: 21 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const moved = await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: {
      origin: 'task',
      source: 'owner',
      taskID: 'task-1',
      proposalID: 'p-1',
      checks: { quote: 'pass' },
    },
  });

  const retired = await ctx.memory.store.retire({
    target: moved,
    intentQuote: 'I moved out',
    intentEvidence: { recordSequence: 9, start: 2, end: 13 },
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  await ctx.memory.store.undo({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const live = await readMemoryRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMemoryRows(ctx.db);

  expect(live.versions).toHaveLength(4);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds pinned, unpinned and forgotten items equal to the live rows', async () => {
  const ctx = await setupTest();

  const pinned = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forgotten = await ctx.memory.store.remember({
    text: 'Allergic to hazelnuts',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: pinned.itemID,
    isPinned: false,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: forgotten,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const live = await readMemoryRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMemoryRows(ctx.db);

  expect(live.items.map((row) => row.state)).toIncludeSameMembers(['active', 'forgotten']);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds a restored item equal to the live rows', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.restore({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const live = await readMemoryRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMemoryRows(ctx.db);

  expect(live.versions).toHaveLength(3);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds an item and its proposal after an approved subject change equal to the live rows', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The owner calls the kettle Captain Steam',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await ctx.memory.store.writes.remember({
    text: 'The owner and the assistant call the kettle Captain Steam',
    target: item,
    subject: 'shared',
    caller: buildMockWriteCaller(),
  });

  const [pending] = await ctx.memory.store.proposals.listPending();

  invariant(pending);

  await ctx.memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const readProposals = () =>
    ctx.db.selectFrom('memory_proposals').selectAll().orderBy('proposal_id').execute();

  const live = await readMemoryRows(ctx.db);
  const liveProposals = await readProposals();

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMemoryRows(ctx.db);
  const rebuiltProposals = await readProposals();

  expect(outcome.status).toBe('proposed');
  expect(live.items).toMatchObject([{ subject: 'shared', version: 2 }]);
  expect(rebuilt).toStrictEqual(live);
  expect(rebuiltProposals).toStrictEqual(liveProposals);
});
