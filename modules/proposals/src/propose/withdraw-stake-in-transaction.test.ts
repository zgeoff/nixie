import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readProposal } from '../rows/read-proposal';
import { startTestProposals } from '../test-utils/start-test-proposals';
import { proposeInTransaction } from './propose-in-transaction';
import { withdrawStakeInTransaction } from './withdraw-stake-in-transaction';

async function setupTest() {
  const proposals = await startTestProposals();

  return {
    ...proposals,
    propose: () =>
      withWriteTransaction(proposals.log.writer, (tx) =>
        proposeInTransaction(proposals.deps, tx, {
          family: 'skill',
          kind: 'internal_change',
          cause: 'skill_write',
          riskClass: 'routine',
          actionHash: 'hash-a',
          ruleHash: null,
          thread: 'task-a',
          taskID: null,
          deadlineAt: null,
          sameThing: null,
        }),
      ),
    withdraw: async (proposalID: string, caller: string) => {
      const row = await readProposal(proposals.log.writer.db, proposalID);

      invariant(row, 'the proposal exists');

      return withWriteTransaction(proposals.log.writer, (tx) =>
        withdrawStakeInTransaction(proposals.deps, tx, {
          row,
          caller,
          mergedThreads: ['task-b'],
        }),
      );
    },
    readState: async (proposalID: string) => {
      const row = await readProposal(proposals.log.writer.db, proposalID);

      return row?.state;
    },
    readSettledThreads: async () => {
      const settled = await readRecords(proposals.log, {
        afterSequence: 0,
        kinds: ['proposals.settled'],
      });

      return settled.map((entry) => entry.record.thread);
    },
  };
}

test('it keeps the card open when the first proposer withdraws and a merged proposer remains', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();
  const result = await ctx.withdraw(proposed.proposalID, 'task-a');
  const state = await ctx.readState(proposed.proposalID);

  expect([result.status, state]).toStrictEqual(['withdrawn', 'pending']);
});

test('it keeps the card open when a merged proposer withdraws and the first proposer remains', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();
  const result = await ctx.withdraw(proposed.proposalID, 'task-b');
  const state = await ctx.readState(proposed.proposalID);

  expect([result.status, state]).toStrictEqual(['withdrawn', 'pending']);
});

test('it settles the proposal as withdrawn when the last proposer withdraws', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();

  await ctx.withdraw(proposed.proposalID, 'task-a');
  await ctx.withdraw(proposed.proposalID, 'task-b');

  const state = await ctx.readState(proposed.proposalID);

  expect(state).toBe('withdrawn');
});

test('it tells a proposer that its stake is gone when it withdraws twice', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();

  await ctx.withdraw(proposed.proposalID, 'task-a');

  const again = await ctx.withdraw(proposed.proposalID, 'task-a');

  expect(again.status).toBe('not_proposer');
});

test('it refuses a caller that holds no stake', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();
  const result = await ctx.withdraw(proposed.proposalID, 'task-c');
  const state = await ctx.readState(proposed.proposalID);

  expect([result.status, state]).toStrictEqual(['not_proposer', 'pending']);
});

test('it writes the settlement on no thread of a proposer that withdrew', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();

  await ctx.withdraw(proposed.proposalID, 'task-a');
  await ctx.withdraw(proposed.proposalID, 'task-b');

  const threads = await ctx.readSettledThreads();

  expect(threads).toStrictEqual([null]);
});
