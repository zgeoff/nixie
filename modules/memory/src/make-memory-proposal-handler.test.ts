import { expect, test } from 'bun:test';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalAnswerInput } from '@heynixie/proposals';
import { answerProposal, buildProposalsProjection } from '@heynixie/proposals';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { makeMemoryProposalHandler } from './make-memory-proposal-handler';
import { mapMemoryProposalRecord } from './map-memory-proposal-record';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { createProposal } from './test-utils/create-proposal';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const port = {
    proposals: memory.store.proposals,
    readTexts: async () => {
      const pending = await memory.store.proposals.listPending();

      return new Map(pending.map((proposal) => [proposal.proposalID, proposal.text]));
    },
  };

  const handlerOptions = {
    log: memory.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    lapseIntervalMs: 14 * 24 * 60 * 60 * 1000,
  };

  const deps = {
    log: memory.log,
    clock,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    handlers: new Map([
      ['memory' as const, makeMemoryProposalHandler({ ...handlerOptions, readStore: () => port })],
    ]),
    projection: buildProposalsProjection([mapMemoryProposalRecord]),
    readDeferContext: () => Promise.resolve({ quietHours: null, zone: 'UTC' }),
    writeThreadRecord: async (
      tx: Parameters<typeof writeRecordsInTransaction>[0],
      input: Parameters<typeof writeRecordsInTransaction>[2][number],
    ) => {
      await writeRecordsInTransaction(tx, memory.log, [input]);
    },
  };

  return {
    memory,
    answer: (input: ProposalAnswerInput) => answerProposal(deps, input, { family: 'memory' }),
    answerBeforeStart: (input: ProposalAnswerInput) =>
      answerProposal(
        {
          ...deps,
          handlers: new Map([
            [
              'memory' as const,
              makeMemoryProposalHandler({ ...handlerOptions, readStore: () => null }),
            ],
          ]),
        },
        input,
        { family: 'memory' },
      ),
  };
}

test('it applies an approved memory proposal through the shared answer path', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Swims at the lido on Fridays' });

  const outcome = await ctx.answer({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    choice: 'approve',
    identityID: 'identity-1',
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(outcome).toStrictEqual({
    status: 'answered',
    result: { proposalID: proposal.proposalID, state: 'approved' },
  });

  expect(pending).toStrictEqual([]);
});

test('it declines a memory proposal, which leaves the pending list', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Owns a red kayak' });

  const outcome = await ctx.answer({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    choice: 'decline',
    note: 'The kayak was sold',
    identityID: 'identity-1',
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(outcome).toStrictEqual({
    status: 'answered',
    result: { proposalID: proposal.proposalID, state: 'declined' },
  });

  expect(pending).toStrictEqual([]);
});

test('it refuses an edit of a pin proposal as NOT_ALLOWED with memory reason PIN_EDIT', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Takes the early ferry on Mondays',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  await ctx.memory.store.writes.pin({ target: item, caller: buildMockWriteCaller() });

  const [proposal] = await ctx.memory.store.proposals.listPending();

  invariant(proposal);

  const outcome = await ctx.answer({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    choice: 'approve',
    identityID: 'identity-1',
    memory: { editedText: 'Takes the late ferry on Mondays' },
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'PIN_EDIT' },
  });

  expect(pending).toHaveLength(1);
});

test('it refuses an answer to a proposal whose target has a newer version as CONFLICT', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Plays chess on Tuesdays',
    provenance: buildMockProvenance({ origin: 'owner', source: 'owner' }),
  });

  const proposal = await createProposal(ctx.memory.store, {
    text: 'Plays chess on Wednesdays',
    target: item,
  });

  await ctx.memory.store.remember({
    text: 'Plays chess on Thursdays',
    target: item,
    provenance: buildMockProvenance({ origin: 'owner', source: 'owner' }),
  });

  const outcome = await ctx.answer({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    choice: 'approve',
    identityID: 'identity-1',
  });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: {
      error: 'CONFLICT',
      current: { actionHash: `${proposal.actionHash}:moved`, ruleHash: null },
    },
  });
});

test('it refuses an answer before the memory store starts as NOT_ALLOWED', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Grows tomatoes on the roof' });

  const outcome = await ctx.answerBeforeStart({
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    choice: 'approve',
    identityID: 'identity-1',
  });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'memory_not_started' },
  });
});
