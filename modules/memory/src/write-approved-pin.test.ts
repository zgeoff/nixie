import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

test('it adds the item to the pinned core when you approve its pin', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  await memory.store.writes.pin({
    target: item,
    caller: buildMockWriteCaller({ thread: 'harbour' }),
  });

  const [proposal] = await memory.store.proposals.listPending();

  invariant(proposal);

  const result = await memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  const core = await memory.store.readPinnedCore();
  const pending = await memory.store.proposals.listPending();

  const records = await readRecords(memory.log, {
    afterSequence: 0,
    kinds: ['memory.approval_recorded', 'memory.pinned'],
  });

  expect(result).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 1 });
  expect(core).toMatchObject([{ itemID: item.itemID, version: 1 }]);
  expect(pending).toStrictEqual([]);

  expect(
    records.map((entry) => [entry.record.kind, entry.record.thread, entry.record.approval]),
  ).toStrictEqual([
    [
      'memory.approval_recorded',
      'harbour',
      {
        proposalID: proposal.proposalID,
        approvalID: expect.toBeString(),
        actionHash: proposal.actionHash,
      },
    ],
    [
      'memory.pinned',
      'harbour',
      {
        proposalID: proposal.proposalID,
        approvalID: expect.toBeString(),
        actionHash: proposal.actionHash,
      },
    ],
  ]);
});

test('it refuses to approve a pin that takes the pinned core past its budget, and pins nothing', async () => {
  const memory = await startTestMemory();

  await memory.store.remember({
    text: 'Keeps a long packing list for trips. '.repeat(119),
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  const item = await memory.store.remember({
    text: 'Keeps a long reading list for winter. '.repeat(116),
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });

  const [proposal] = await memory.store.proposals.listPending();

  invariant(proposal);

  const approve = memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  await approve.catch(() => {});

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('is_pinned')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  const pending = await memory.store.proposals.listPending();

  expect(approve).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
  expect(row.is_pinned).toBe(0);
  expect(pending).toMatchObject([{ proposalID: proposal.proposalID }]);
});

test('it refuses to approve a pin with edited text', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });

  const [proposal] = await memory.store.proposals.listPending();

  invariant(proposal);

  const approve = memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
    editedText: 'Takes the late ferry on Mondays',
  });

  expect(approve).rejects.toMatchObject({ code: 'PIN_EDIT' });
});

test('it refuses to approve a pin of a version the item moved past', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: buildMockProvenance(),
  });

  await memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });

  const [proposal] = await memory.store.proposals.listPending();

  invariant(proposal);

  await memory.store.remember({
    text: 'Takes the late ferry on Mondays',
    target: item,
    provenance: buildMockProvenance(),
  });

  const approve = memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  expect(approve).rejects.toMatchObject({ code: 'STALE_VERSION' });
});
