import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readProposal } from '../rows/read-proposal';
import { startTestProposals } from '../test-utils/start-test-proposals';
import { proposeInTransaction } from './propose-in-transaction';
import { writeSettlement } from './write-settlement';

async function setupTest() {
  const proposals = await startTestProposals();

  const asked: { thread: string; proposedSequence: number }[] = [];

  const deps = {
    ...proposals.deps,
    readSettlementTarget: (_tx: unknown, thread: string, proposedSequence: number) => {
      asked.push({ thread, proposedSequence });

      return Promise.resolve({ thread: `${thread}-target`, task: thread });
    },
  };

  return {
    ...proposals,
    asked,
    propose: () =>
      withWriteTransaction(proposals.log.writer, (tx) =>
        proposeInTransaction(deps, tx, {
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
    settle: async (proposalID: string, otherStakes: { thread: string; sequence: number }[]) => {
      const row = await readProposal(proposals.log.writer.db, proposalID);

      invariant(row, 'the proposal exists');

      await withWriteTransaction(proposals.log.writer, (tx) =>
        writeSettlement(deps, tx, {
          row,
          outcome: 'approved',
          answeredBy: 'owner',
          usedBy: null,
          reason: null,
          detail: null,
          otherStakes,
          byProposer: false,
        }),
      );

      return row.createdSequence;
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

test("it resolves each proposer's target from the sequence of that proposer's own claim", async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();

  const createdSequence = await ctx.settle(proposed.proposalID, [
    { thread: 'task-b', sequence: 9001 },
  ]);

  expect(ctx.asked).toStrictEqual([
    { thread: 'task-a', proposedSequence: createdSequence },
    { thread: 'task-b', proposedSequence: 9001 },
  ]);
});

test("it tells each proposer's resolved thread", async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();

  await ctx.settle(proposed.proposalID, [{ thread: 'task-b', sequence: 9001 }]);

  const threads = await ctx.readSettledThreads();

  expect(threads).toStrictEqual(['task-a-target', 'task-b-target']);
});

test('it tells a thread once when a merge names the thread that opened the proposal', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();

  await ctx.settle(proposed.proposalID, [{ thread: 'task-a', sequence: 9001 }]);

  const threads = await ctx.readSettledThreads();

  expect(threads).toStrictEqual(['task-a-target']);
});
