import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import { buildMockWriteCaller, createProposal } from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

// a test API that serves a memory store over its log, whose gate has no checker, so every write it
// gates becomes a proposal, and a signed-in laptop
async function setupTest() {
  const api = await startTestAPI();

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: () => Promise.resolve(),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: api.clock,
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  // boot data: every proposal procedure needs a signed-in device
  const laptop = await createDeviceSession(api.context, 'laptop');

  return { ...api, memory, laptop, client: buildTestClient(api.url, laptop.token) };
}

test('#memory.listProposals lists each pending proposal with its review reason, its quote inside its message and its lapse time', async () => {
  const ctx = await setupTest();

  const sent = await ctx.client.conversation.send({
    clientMessageId: '0d6b1c3a-7e2f-4a95-8c14-3f9e2a7b5d60',
    spans: [{ start: 0, end: 33, source: 'typed' }],
    text: 'I signed up for the harbour swim.',
    thread: 'conversation',
  });

  await ctx.memory.writes.remember({
    text: 'Signed up for the harbour swim',
    quote: 'signed up for the harbour swim',
    caller: buildMockWriteCaller(),
  });

  const [proposal] = await ctx.memory.proposals.listPending();

  invariant(proposal);

  const listed = await ctx.client.memory.listProposals();

  expect(listed).toStrictEqual({
    proposals: [
      {
        proposalID: proposal.proposalID,
        operation: 'remember',
        itemID: proposal.itemID,
        targetVersion: null,
        isPinned: false,
        reason: 'checker_unreachable',
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
        text: 'Signed up for the harbour swim',
        quote: 'signed up for the harbour swim',
        evidence: {
          sequence: sent.sequence,
          start: 2,
          end: 32,
          message: { status: 'readable', text: 'I signed up for the harbour swim.' },
        },
      },
    ],
  });
});

test('#memory.listProposals refuses a caller with no session as unauthorized', async () => {
  const ctx = await setupTest();

  const listed = buildTestClient(ctx.url).memory.listProposals();

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
});

test('#memory.approveProposals refuses an answer before the memory store starts', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const approved = buildTestClient(api.url, laptop.token).memory.approveProposals({
    answers: [
      {
        clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        proposalID: 'proposal-a',
        actionHash: 'sha256:a1',
      },
    ],
  });

  await approved.catch(() => {});

  expect(approved).rejects.toMatchObject({ code: 'MEMORY_NOT_STARTED', status: 503 });
});

test('#memory.approveProposals approves 3 proposals in one call, each with its own approval record that names the device', async () => {
  const ctx = await setupTest();
  const first = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });
  const second = await createProposal(ctx.memory, { text: 'Cycles to work on Mondays' });
  const third = await createProposal(ctx.memory, { text: 'Reads crime novels' });

  const approved = await ctx.client.memory.approveProposals({
    answers: [first, second, third].map((proposal) => ({
      clientActionID: crypto.randomUUID(),
      proposalID: proposal.proposalID,
      actionHash: proposal.actionHash,
    })),
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['memory.approval_recorded'],
  });

  expect(approved).toStrictEqual({
    outcomes: [
      { proposalID: first.proposalID, status: 'applied' },
      { proposalID: second.proposalID, status: 'applied' },
      { proposalID: third.proposalID, status: 'applied' },
    ],
  });

  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    {
      proposalID: first.proposalID,
      approvalID: expect.toBeString(),
      actionHash: first.actionHash,
      answer: 'approved',
      identityID: ctx.laptop.caller.identityID,
    },
    {
      proposalID: second.proposalID,
      approvalID: expect.toBeString(),
      actionHash: second.actionHash,
      answer: 'approved',
      identityID: ctx.laptop.caller.identityID,
    },
    {
      proposalID: third.proposalID,
      approvalID: expect.toBeString(),
      actionHash: third.actionHash,
      answer: 'approved',
      identityID: ctx.laptop.caller.identityID,
    },
  ]);
});

test('#memory.approveProposals runs the close match check again on edited text, and applies nothing when an active item states it', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.remember({
    text: 'Swims at the harbour pool every Tuesday',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const proposal = await createProposal(ctx.memory, { text: 'Plays chess on Fridays' });

  const approved = await ctx.client.memory.approveProposals({
    answers: [
      {
        clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        editedText: 'Swims at the harbour pool on Tuesdays',
      },
    ],
  });

  const [history, pending] = await Promise.all([
    ctx.memory.readHistory(proposal.itemID),
    ctx.memory.proposals.listPending(),
  ]);

  expect(approved).toStrictEqual({
    outcomes: [
      {
        proposalID: proposal.proposalID,
        status: 'close_match',
        item: { itemID: item.itemID, version: 1, text: 'Swims at the harbour pool every Tuesday' },
      },
    ],
  });

  expect(history).toBeNull();
  expect(pending).toMatchObject([{ proposalID: proposal.proposalID }]);
});

test('#memory.approveProposals applies edited text as your own words', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory, { text: 'Plays chess on Fridya' });

  await ctx.client.memory.approveProposals({
    answers: [
      {
        clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        editedText: 'Plays chess on Fridays',
      },
    ],
  });

  const history = await ctx.memory.readHistory(proposal.itemID);

  expect(history?.versions).toMatchObject([
    { text: 'Plays chess on Fridays', origin: 'owner', source: 'owner' },
  ]);
});

test('#memory.approveProposals answers a lapsed proposal as stale and writes no record', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });

  ctx.clock.advance(proposal.lapseAt - ctx.clock.now());

  const before = await readRecords(ctx.context.log, { afterSequence: 0, limit: 1000 });

  const approved = await ctx.client.memory.approveProposals({
    answers: [
      {
        clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
      },
    ],
  });

  const after = await readRecords(ctx.context.log, { afterSequence: 0, limit: 1000 });

  expect(approved).toStrictEqual({
    outcomes: [{ proposalID: proposal.proposalID, status: 'stale', cause: 'lapsed' }],
  });

  expect(after).toHaveLength(before.length);
});

test('#memory.approveProposals goes on past a stale answer to the answers after it', async () => {
  const ctx = await setupTest();
  const answered = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });
  const open = await createProposal(ctx.memory, { text: 'Cycles to work on Mondays' });

  await ctx.memory.proposals.reject({
    proposalID: answered.proposalID,
    actionHash: answered.actionHash,
    identityID: 'host',
  });

  const approved = await ctx.client.memory.approveProposals({
    answers: [answered, open].map((proposal) => ({
      clientActionID: crypto.randomUUID(),
      proposalID: proposal.proposalID,
      actionHash: proposal.actionHash,
    })),
  });

  expect(approved).toStrictEqual({
    outcomes: [
      { proposalID: answered.proposalID, status: 'stale', cause: 'answered' },
      { proposalID: open.proposalID, status: 'applied' },
    ],
  });
});

test('#memory.rejectProposals rejects each proposal with its own rejection record and reason', async () => {
  const ctx = await setupTest();
  const first = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });
  const second = await createProposal(ctx.memory, { text: 'Cycles to work on Mondays' });

  const rejected = await ctx.client.memory.rejectProposals({
    answers: [
      {
        clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        proposalID: first.proposalID,
        actionHash: first.actionHash,
        reason: 'the tomatoes were a one-off',
      },
      {
        clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
        proposalID: second.proposalID,
        actionHash: second.actionHash,
      },
    ],
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['memory.proposal_rejected'],
  });

  expect(rejected).toStrictEqual({
    outcomes: [
      { proposalID: first.proposalID, status: 'rejected' },
      { proposalID: second.proposalID, status: 'rejected' },
    ],
  });

  expect(records.map((entry) => [entry.record.payload, entry.record.erasable])).toStrictEqual([
    [
      { proposalID: first.proposalID },
      { status: 'readable', fields: { reason: 'the tomatoes were a one-off' } },
    ],
    [{ proposalID: second.proposalID }, { status: 'none' }],
  ]);
});
