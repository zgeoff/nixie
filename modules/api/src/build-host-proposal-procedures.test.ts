import { expect, test } from 'bun:test';
import { buildMockWriteCaller, createProposal, startTestMemory } from '@heynixie/memory/test-utils';
import { createRouterClient } from '@orpc/server';
import { buildHostProposalProcedures } from './build-host-proposal-procedures';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, client: createRouterClient(buildHostProposalProcedures(() => memory.store)) };
}

test('#list lists each pending proposal with its text and the hash an answer binds to', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });
  const pending = await ctx.client.list();

  expect(pending).toStrictEqual([
    {
      proposalID: proposal.proposalID,
      operation: 'remember',
      itemID: proposal.itemID,
      targetVersion: null,
      isPinned: false,
      subject: 'owner',
      kind: 'fact',
      reason: 'no_quote',
      actionHash: proposal.actionHash,
      origin: 'conversation',
      source: 'untrusted',
      createdAt: new Date(proposal.createdAt),
      lapseAt: new Date(proposal.lapseAt),
      sources: [
        {
          origin: 'conversation',
          thread: 'conversation',
          proposedAt: new Date(proposal.createdAt),
        },
      ],
      text: 'Likes jazz',
      quote: null,
    },
  ]);
});

test('#list lists a self-note with its kind and the self-note review reason', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.writes.remember({
    text: 'Likes a question that takes a while to answer',
    subject: 'self',
    caller: buildMockWriteCaller(),
  });

  const pending = await ctx.client.list();

  expect(pending).toMatchObject([
    { subject: 'self', reason: 'self_note', text: 'Likes a question that takes a while to answer' },
  ]);
});

test('#list refuses a request before the memory store starts with MEMORY_NOT_STARTED', async () => {
  const client = createRouterClient(buildHostProposalProcedures(() => null));
  const listed = client.list();

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({
    code: 'MEMORY_NOT_STARTED',
    status: 503,
    message: 'the memory store has not started yet',
  });
});

test('#approve applies a proposal and answers with the version it wrote', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jaz' });

  const result = await ctx.client.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    editedText: 'Likes jazz',
  });

  expect(result).toStrictEqual({ status: 'applied', itemID: proposal.itemID, version: 1 });
});

test('#approve answers an approval an active item closely matches with that item, and applies nothing', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The owner swims every Tuesday.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const proposal = await createProposal(ctx.memory.store, { text: 'Owner swims every Tuesday' });

  const held = await ctx.client.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(held).toStrictEqual({
    status: 'close_match',
    item: { itemID: item.itemID, version: 1, text: 'The owner swims every Tuesday.' },
  });

  expect(pending).toMatchObject([{ proposalID: proposal.proposalID }]);
});

test('#approve refuses an answer under another action hash with PROPOSAL_HASH, and applies nothing', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  const approved = ctx.client.approve({
    proposalID: proposal.proposalID,
    actionHash: 'sha256:another',
  });

  await approved.catch(() => {});

  const history = await ctx.memory.store.readHistory(proposal.itemID);

  expect(approved).rejects.toMatchObject({ code: 'PROPOSAL_HASH', status: 409 });
  expect(history).toBeNull();
});

test('#approve refuses a proposal that does not exist with NOT_FOUND', async () => {
  const ctx = await setupTest();

  const approved = ctx.client.approve({
    proposalID: '0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f',
    actionHash: 'sha256:any',
  });

  await approved.catch(() => {});

  expect(approved).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
});

test('#approve refuses an answer with no action hash as a bad request', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  const approved = ctx.client.approve({ proposalID: proposal.proposalID, actionHash: '' });

  await approved.catch(() => {});

  expect(approved).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
});

test('#approve refuses an approval that gives a reason as a bad request, and applies nothing', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  const approved = ctx.client.approve({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,

    // @ts-expect-error -- an approval takes no reason, which the input schema refuses
    reason: 'sounds right',
  });

  await approved.catch(() => {});

  const history = await ctx.memory.store.readHistory(proposal.itemID);

  expect(approved).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
  expect(history).toBeNull();
});

test('#reject rejects a proposal, which leaves the pending list', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Prefers tabs.' });

  const rejected = await ctx.client.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    reason: "wrong, it's spaces",
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(rejected).toStrictEqual({ proposalID: proposal.proposalID });
  expect(pending).toStrictEqual([]);
});

test('#reject refuses a blank reason as a bad request, and rejects nothing', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Prefers tabs.' });

  const rejected = ctx.client.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    reason: '   ',
  });

  await rejected.catch(() => {});

  const pending = await ctx.memory.store.proposals.listPending();

  expect(rejected).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
  expect(pending).toMatchObject([{ proposalID: proposal.proposalID }]);
});

test('#reject refuses a rejection that carries edited text as a bad request, and rejects nothing', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Prefers tabs.' });

  const rejected = ctx.client.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,

    // @ts-expect-error -- a rejection takes no edited text, which the input schema refuses
    editedText: 'Prefers spaces.',
  });

  await rejected.catch(() => {});

  const pending = await ctx.memory.store.proposals.listPending();

  expect(rejected).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
  expect(pending).toMatchObject([{ proposalID: proposal.proposalID }]);
});
