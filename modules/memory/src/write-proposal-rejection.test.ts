import { expect, test } from 'bun:test';
import { findRecordKeys, readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createProposal } from './test-utils/create-proposal';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

test('it rejects a proposal and drops the key of the item it would have created', async () => {
  const memory = await startTestMemory();

  await memory.store.writes.remember({
    text: 'Likes jazz',
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  await memory.store.proposals.reject({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_proposals')
    .select('status')
    .where('proposal_id', '=', pending.proposalID)
    .executeTakeFirstOrThrow();

  const keys = await findRecordKeys(memory.log, [pending.itemID]);

  expect(row.status).toBe('rejected');
  expect(keys.get(pending.itemID)).toBeUndefined();
});

test('it keeps your reason in the erasable fields of the rejection record', async () => {
  const memory = await startTestMemory();
  const proposal = await createProposal(memory.store, { text: 'Prefers tabs.' });

  await memory.store.proposals.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
    reason: "wrong, it's spaces",
  });

  const records = await readRecords(memory.log, {
    afterSequence: 0,
    kinds: ['memory.proposal_rejected'],
  });

  expect(records.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { reason: "wrong, it's spaces" } },
  ]);
});

test('it writes no erasable fields for a rejection with no reason', async () => {
  const memory = await startTestMemory();
  const proposal = await createProposal(memory.store, { text: 'Prefers tabs.' });

  await memory.store.proposals.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  const records = await readRecords(memory.log, {
    afterSequence: 0,
    kinds: ['memory.proposal_rejected'],
  });

  expect(records.map((entry) => entry.record.erasable)).toStrictEqual([{ status: 'none' }]);
});

test('it keeps your reason after the rejection removes the key of the item it would have created', async () => {
  const memory = await startTestMemory();
  const proposal = await createProposal(memory.store, { text: 'Prefers tabs.' });

  await memory.store.proposals.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
    reason: "wrong, it's spaces",
  });

  const [records, keys] = await Promise.all([
    readRecords(memory.log, { afterSequence: 0, kinds: ['memory.proposal_rejected'] }),
    findRecordKeys(memory.log, [proposal.itemID]),
  ]);

  expect(keys.get(proposal.itemID)).toBeUndefined();

  expect(records.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { reason: "wrong, it's spaces" } },
  ]);
});

test('it keeps the key of an existing item when you reject an edit of it', async () => {
  const memory = await startTestMemory();

  const item = await memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.writes.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'claude-opus-5-5',
    },
  });

  const [pending] = await memory.store.proposals.listPending();

  invariant(pending);

  await memory.store.proposals.reject({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const recalled = await memory.store.recall({ itemIDs: [item.itemID] });

  expect(recalled.items).toMatchObject([{ text: 'Lives on Elm Street' }]);
});

test("it rejects nothing and leaves the proposal pending when the caller's own write refuses the rejection", async () => {
  const memory = await startTestMemory();
  const pending = await createProposal(memory.store, { text: 'Keeps bees' });

  const rejected = memory.store.proposals.reject({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
    writeInTransaction: () => Promise.reject(new Error('the caller refused')),
  });

  await rejected.catch(() => {});

  const remaining = await memory.store.proposals.listPending();

  expect(rejected).rejects.toThrow('the caller refused');
  expect(remaining).toMatchObject([{ proposalID: pending.proposalID }]);
});
