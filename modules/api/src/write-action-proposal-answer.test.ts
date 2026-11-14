import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { buildActionProposalInput, readActionProposals } from '@heynixie/policy';
import { createConversationTask, readInbox, tasksProjections } from '@heynixie/tasks';
import { writeActionProposalAnswer } from './write-action-proposal-answer';

async function setupTest() {
  const started = await startTestLog();

  const log = { ...started.log, projections: [...started.log.projections, ...tasksProjections] };

  const context = {
    log,
    clock: started.clock,
    definitions: () => ({ snapshotHash: 'snapshot-1' }),
  };

  await createConversationTask(context);

  const proposed = buildActionProposalInput({
    definitions: context.definitions(),
    thread: 'conversation',
    callSequence: 1,
    tool: 'mail.send',
    effects: ['send'],
    cause: 'no_rule',
    input: { to: 'sam@example.org' },
    destinations: [{ value: 'sam@example.org', replyTarget: false }],
  });

  await writeRecords(log, [proposed.record]);

  return {
    context,
    clock: started.clock,
    shortID: proposed.shortID,
    readAnswers: async () => {
      const inbox = await readInbox(context, 'conversation');

      return inbox.filter((record) => record.kind === 'policy.action_answered');
    },
  };
}

test('it puts an approval in the inbox of the task that asked, and runs nothing', async () => {
  const ctx = await setupTest();

  const result = await writeActionProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: ctx.shortID,
  });

  const answers = await ctx.readAnswers();
  const proposals = await readActionProposals(ctx.context.log.writer.db);

  expect(result).toStrictEqual({ status: 'approved', proposalID: ctx.shortID });
  expect(answers).toMatchObject([{ thread: 'conversation', payload: { answer: 'approved' } }]);
  expect(proposals.map((proposal) => proposal.outcome)).toStrictEqual(['approved']);
});

test('it keeps the reason of a decline in the answer record', async () => {
  const ctx = await setupTest();

  await writeActionProposalAnswer(ctx.context, {
    answer: 'reject',
    proposalID: ctx.shortID,
    reason: 'Not this week.',
  });

  const answers = await ctx.readAnswers();

  expect(answers).toMatchObject([
    {
      payload: { answer: 'declined' },
      erasable: { status: 'readable', fields: { reason: 'Not this week.' } },
    },
  ]);
});

test('it refuses an ID that no proposal has', async () => {
  const ctx = await setupTest();

  const result = await writeActionProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: 'nothing-here',
  });

  expect(result).toMatchObject({ status: 'refused', code: 'NOT_FOUND' });
});

test('it refuses a second answer to the same proposal', async () => {
  const ctx = await setupTest();

  await writeActionProposalAnswer(ctx.context, { answer: 'approve', proposalID: ctx.shortID });

  const second = await writeActionProposalAnswer(ctx.context, {
    answer: 'reject',
    proposalID: ctx.shortID,
    reason: null,
  });

  expect(second).toMatchObject({ status: 'refused', code: 'PROPOSAL_CLOSED' });
});

test('it refuses an answer once the proposal has lapsed', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(72 * 3_600_000 + 1);

  const result = await writeActionProposalAnswer(ctx.context, {
    answer: 'approve',
    proposalID: ctx.shortID,
  });

  expect(result).toMatchObject({ status: 'refused', code: 'PROPOSAL_CLOSED' });
});
