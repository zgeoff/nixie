import { expect, onTestFinished, test } from 'bun:test';
import type { WriteInTransaction } from '@heynixie/memory';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import { createProposal } from '@heynixie/memory/test-utils';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import { writeProposalAnswer } from './write-proposal-answer';
import { writeSessionRevocation } from './write-session-revocation';

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

  return { ...api, memory };
}

test('it approves the proposal and keeps its outcome with it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const proposal = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });

  const outcome = await writeProposalAnswer(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.approveProposals',
    proposalID: proposal.proposalID,
    input: { proposalID: proposal.proposalID, actionHash: proposal.actionHash },
    committed: { proposalID: proposal.proposalID, status: 'applied' },
    apply: async (writeInTransaction) => {
      await ctx.memory.proposals.approve({
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        identityID: laptop.caller.identityID,
        writeInTransaction,
      });

      return null;
    },
  });

  const actions = await ctx.writer.db
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select(['procedure', 'identity_id', 'result'])
    .where('client_action_id', '=', '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85')
    .execute();

  expect(outcome).toStrictEqual({ proposalID: proposal.proposalID, status: 'applied' });

  expect(actions).toStrictEqual([
    {
      procedure: 'memory.approveProposals',
      identity_id: laptop.caller.identityID,
      result: JSON.stringify({ proposalID: proposal.proposalID, status: 'applied' }),
    },
  ]);
});

test('it answers a retry with its first outcome without answering again', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const proposal = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });

  const action = {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.rejectProposals',
    proposalID: proposal.proposalID,
    input: { proposalID: proposal.proposalID, actionHash: proposal.actionHash },
    committed: { proposalID: proposal.proposalID, status: 'rejected' as const },
    apply: async (writeInTransaction: WriteInTransaction) => {
      await ctx.memory.proposals.reject({
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        identityID: laptop.caller.identityID,
        writeInTransaction,
      });

      return null;
    },
  };

  await writeProposalAnswer(ctx.context, laptop.caller, action);

  const retried = await writeProposalAnswer(ctx.context, laptop.caller, action);

  expect(retried).toStrictEqual({ proposalID: proposal.proposalID, status: 'rejected' });
});

test('it refuses an ID that another action used, and answers nothing', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const first = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });
  const second = await createProposal(ctx.memory, { text: 'Cycles to work' });

  await writeProposalAnswer(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.rejectProposals',
    proposalID: first.proposalID,
    input: { proposalID: first.proposalID, actionHash: first.actionHash },
    committed: { proposalID: first.proposalID, status: 'rejected' },
    apply: async (writeInTransaction) => {
      await ctx.memory.proposals.reject({
        proposalID: first.proposalID,
        actionHash: first.actionHash,
        identityID: laptop.caller.identityID,
        writeInTransaction,
      });

      return null;
    },
  });

  const outcome = await writeProposalAnswer(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.rejectProposals',
    proposalID: second.proposalID,
    input: { proposalID: second.proposalID, actionHash: second.actionHash },
    committed: { proposalID: second.proposalID, status: 'rejected' },
    apply: async (writeInTransaction) => {
      await ctx.memory.proposals.reject({
        proposalID: second.proposalID,
        actionHash: second.actionHash,
        identityID: laptop.caller.identityID,
        writeInTransaction,
      });

      return null;
    },
  });

  const pending = await ctx.memory.proposals.listPending();

  expect(outcome).toStrictEqual({
    proposalID: second.proposalID,
    status: 'refused',
    code: 'CLIENT_ACTION_ID_REUSED',
  });

  expect(pending).toMatchObject([{ proposalID: second.proposalID }]);
});

test('it answers nothing for a session revoked after the call resolved it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const proposal = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });

  await writeSessionRevocation(ctx.context, laptop.caller, {
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    sessionID: laptop.sessionID,
  });

  const outcome = await writeProposalAnswer(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.rejectProposals',
    proposalID: proposal.proposalID,
    input: { proposalID: proposal.proposalID, actionHash: proposal.actionHash },
    committed: { proposalID: proposal.proposalID, status: 'rejected' },
    apply: async (writeInTransaction) => {
      await ctx.memory.proposals.reject({
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        identityID: laptop.caller.identityID,
        writeInTransaction,
      });

      return null;
    },
  });

  const pending = await ctx.memory.proposals.listPending();

  expect(outcome).toBeNull();
  expect(pending).toMatchObject([{ proposalID: proposal.proposalID }]);
});

test('it answers a proposal past its lapse time as stale, and keeps no result', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const proposal = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });

  ctx.clock.advance(proposal.lapseAt - ctx.clock.now());

  const outcome = await writeProposalAnswer(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.rejectProposals',
    proposalID: proposal.proposalID,
    input: { proposalID: proposal.proposalID, actionHash: proposal.actionHash },
    committed: { proposalID: proposal.proposalID, status: 'rejected' },
    apply: async (writeInTransaction) => {
      await ctx.memory.proposals.reject({
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        identityID: laptop.caller.identityID,
        writeInTransaction,
      });

      return null;
    },
  });

  const actions = await ctx.writer.db
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select('client_action_id')
    .where('procedure', 'like', 'memory.%')
    .execute();

  expect(outcome).toStrictEqual({
    proposalID: proposal.proposalID,
    status: 'stale',
    cause: 'lapsed',
  });

  expect(actions).toStrictEqual([]);
});

test.each([
  ['PROPOSAL_HASH', { status: 'stale', cause: 'changed' }],
  ['NOT_FOUND', { status: 'stale', cause: 'gone' }],
  ['STALE_VERSION', { status: 'stale', cause: 'moved' }],
  ['PINNED_CORE_FULL', { status: 'refused', code: 'PINNED_CORE_FULL' }],
  ['PIN_EDIT', { status: 'refused', code: 'PIN_EDIT' }],
  ['RETIREMENT_EDIT', { status: 'refused', code: 'RETIREMENT_EDIT' }],
  ['REVISION_TARGET', { status: 'refused', code: 'REVISION_TARGET' }],
  ['SELF_NOTE_REFUSED', { status: 'refused', code: 'REVISION_TARGET' }],
  ['WRONG_STATE', { status: 'refused', code: 'WRONG_STATE' }],
] as const)('it answers a refusal coded %s as its outcome', async (code, expected) => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const outcome = await writeProposalAnswer(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.approveProposals',
    proposalID: 'proposal-a',
    input: { proposalID: 'proposal-a', actionHash: 'sha256:a1' },
    committed: { proposalID: 'proposal-a', status: 'applied' },
    apply: () => Promise.reject(Object.assign(new Error('the store refused'), { code })),
  });

  expect(outcome).toStrictEqual({ proposalID: 'proposal-a', ...expected });
});

test('it answers a proposal already answered as stale', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const proposal = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });

  await ctx.memory.proposals.reject({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    identityID: 'host',
  });

  const outcome = await writeProposalAnswer(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.approveProposals',
    proposalID: proposal.proposalID,
    input: { proposalID: proposal.proposalID, actionHash: proposal.actionHash },
    committed: { proposalID: proposal.proposalID, status: 'applied' },
    apply: async (writeInTransaction) => {
      await ctx.memory.proposals.approve({
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        identityID: laptop.caller.identityID,
        writeInTransaction,
      });

      return null;
    },
  });

  expect(outcome).toStrictEqual({
    proposalID: proposal.proposalID,
    status: 'stale',
    cause: 'answered',
  });
});

test('it throws an error the store gives no known code for', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const answered = writeProposalAnswer(ctx.context, laptop.caller, {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.approveProposals',
    proposalID: 'proposal-a',
    input: { proposalID: 'proposal-a', actionHash: 'sha256:a1' },
    committed: { proposalID: 'proposal-a', status: 'applied' },
    apply: () => Promise.reject(new Error('the disk is full')),
  });

  await answered.catch(() => {});

  expect(answered).rejects.toThrow('the disk is full');
});

test('it answers 2 overlapping calls with one ID with the outcome the first one committed', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const proposal = await createProposal(ctx.memory, { text: 'Grows tomatoes on the balcony' });

  const action = {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    procedure: 'memory.approveProposals',
    proposalID: proposal.proposalID,
    input: { proposalID: proposal.proposalID, actionHash: proposal.actionHash },
    committed: { proposalID: proposal.proposalID, status: 'applied' as const },
    apply: async (writeInTransaction: WriteInTransaction) => {
      await ctx.memory.proposals.approve({
        proposalID: proposal.proposalID,
        actionHash: proposal.actionHash,
        identityID: laptop.caller.identityID,
        writeInTransaction,
      });

      return null;
    },
  };

  const outcomes = await Promise.all([
    writeProposalAnswer(ctx.context, laptop.caller, action),
    writeProposalAnswer(ctx.context, laptop.caller, action),
  ]);

  expect(outcomes).toStrictEqual([
    { proposalID: proposal.proposalID, status: 'applied' },
    { proposalID: proposal.proposalID, status: 'applied' },
  ]);
});
