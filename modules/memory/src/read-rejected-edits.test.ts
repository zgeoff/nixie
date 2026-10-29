import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { createProposal } from './test-utils/create-proposal';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test("it reads the conversation's own rejected edit of an item", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Avery prefers spaces.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const proposal = await createProposal(ctx.memory.store, {
    text: 'Avery prefers tabs.',
    target: item,
  });

  await ctx.memory.store.proposals.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  const texts = await ctx.memory.store.proposals.readRejectedEdits([proposal.proposalID]);

  expect([...texts]).toStrictEqual([[proposal.proposalID, 'Avery prefers tabs.']]);
});

test('it leaves out an edit of a sensitive item', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives at 12 Juniper Row',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.markSensitive({
    itemID: item.itemID,
    isSensitive: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const proposal = await createProposal(ctx.memory.store, {
    text: 'Lives at 14 Juniper Row',
    target: item,
  });

  await ctx.memory.store.proposals.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  const texts = await ctx.memory.store.proposals.readRejectedEdits([proposal.proposalID]);

  expect([...texts]).toStrictEqual([]);
});

test('it leaves out an edit whose item a forget began to remove', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Avery prefers spaces.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const proposal = await createProposal(ctx.memory.store, {
    text: 'Avery prefers tabs.',
    target: item,
  });

  await ctx.memory.store.proposals.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { itemID: item.itemID, version: 1, evidenceSequences: [] },
    },
  ]);

  const texts = await ctx.memory.store.proposals.readRejectedEdits([proposal.proposalID]);

  expect([...texts]).toStrictEqual([]);
});

test('it leaves out a rejected edit from outside the conversation', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Avery prefers spaces.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const proposal = await createProposal(ctx.memory.store, {
    text: 'Avery prefers tabs.',
    target: item,
    caller: {
      origin: 'task',
      thread: 'task-garden',
      taskID: 'task-garden',
      runID: 'task-garden',
      model: 'claude-test-1',
    },
  });

  await ctx.memory.store.proposals.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'identity-1',
  });

  const texts = await ctx.memory.store.proposals.readRejectedEdits([proposal.proposalID]);

  expect([...texts]).toStrictEqual([]);
});

test('it leaves out a proposal that is still pending', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Avery prefers spaces.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const proposal = await createProposal(ctx.memory.store, {
    text: 'Avery prefers tabs.',
    target: item,
  });

  const texts = await ctx.memory.store.proposals.readRejectedEdits([proposal.proposalID]);

  expect([...texts]).toStrictEqual([]);
});
