import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildMockWriteCaller } from './build-mock-write-caller';
import { createProposal } from './create-proposal';
import { readApprovalRecords } from './read-approval-records';
import { startTestMemory } from './start-test-memory';

test('it reads the approval record first, with placeholders for its own IDs and hash', async () => {
  const memory = await startTestMemory();
  const proposal = await createProposal(memory.store, { text: 'Likes jazz' });

  await memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  const [approval] = await readApprovalRecords(memory.log, proposal);

  expect(approval).toStrictEqual({
    kind: 'memory.approval_recorded',
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'conversation',
    stepKey: null,
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: { proposalID: '<proposal>', approvalID: '<approval>', actionHash: '<action-hash>' },
    payload: {
      proposalID: '<proposal>',
      approvalID: '<approval>',
      actionHash: '<action-hash>',
      answer: 'approved',
      identityID: 'identity-1',
    },
    erasable: { status: 'none' },
  });
});

test('it reads the version the approval applied, with placeholders for its item, its short ID and its text', async () => {
  const memory = await startTestMemory();
  const proposal = await createProposal(memory.store, {
    text: 'Likes jazz',
    caller: buildMockWriteCaller({ model: 'claude-test-1' }),
  });

  await memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  const [, version] = await readApprovalRecords(memory.log, proposal);

  expect(version).toMatchObject({
    kind: 'memory.version_added',
    contentSource: 'untrusted',
    approval: { proposalID: '<proposal>', approvalID: '<approval>', actionHash: '<action-hash>' },
    payload: {
      itemID: '<item>',
      version: 1,
      change: 'created',
      state: 'active',
      sealed: '<sealed>',
      evidence: null,
      intentEvidence: null,
      origin: 'conversation',
      source: 'untrusted',
      taskID: 'conversation',
      proposalID: '<proposal>',
      checks: { quote: 'fail' },
      model: 'claude-test-1',
      noticeKey: null,
      shortID: '<short-id>',
    },
  });
});

test('it reads an approval that the log holds past its first page of records', async () => {
  const memory = await startTestMemory();

  // more records than one page of a log read returns
  await writeRecords(
    memory.log,
    Array.from({ length: 150 }, () => ({
      kind: 'test.filler',
      definitions: { snapshotHash: 'sha256:test' },
      payload: {},
    })),
  );
  const proposal = await createProposal(memory.store, { text: 'Likes jazz' });

  await memory.store.proposals.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  const records = await readApprovalRecords(memory.log, proposal);

  expect(records.map((record) => record['kind'])).toStrictEqual([
    'memory.approval_recorded',
    'memory.version_added',
  ]);
});

test('it reads no record of another proposal or of a proposal still pending', async () => {
  const memory = await startTestMemory();
  const approved = await createProposal(memory.store, { text: 'Likes jazz' });
  const pending = await createProposal(memory.store, { text: 'Likes tea' });

  await memory.store.proposals.approve({
    proposalID: approved.proposalID,
    actionHash: approved.actionHash,
    identityID: 'identity-1',
  });

  const records = await readApprovalRecords(memory.log, pending);

  expect(records).toStrictEqual([]);
});
