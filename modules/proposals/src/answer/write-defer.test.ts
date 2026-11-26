import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { proposeInTransaction } from '../propose/propose-in-transaction';
import { readProposal } from '../rows/read-proposal';
import { startTestProposals } from '../test-utils/start-test-proposals';
import { answerProposal } from './answer-proposal';

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
    read: (proposalID: string) => readProposal(proposals.log.writer.db, proposalID),
  };
}

test('it lapses a deferred proposal one lapse interval after its return time', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.propose();

  const deferUntil = ctx.clock.now() + 20 * 24 * 60 * 60 * 1000;

  await answerProposal(
    ctx.deps,
    {
      proposalID: proposed.proposalID,
      actionHash: 'hash-a',
      choice: 'defer',
      deferUntil,
      identityID: 'owner',
    },
    { family: 'skill' },
  );

  const row = await ctx.read(proposed.proposalID);

  invariant(row !== null && row.returnAt !== null, 'a deferred row has its return time');

  expect([row.state, row.lapsesAt]).toStrictEqual([
    'deferred',
    row.returnAt + 14 * 24 * 60 * 60 * 1000,
  ]);
});
