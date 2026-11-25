import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { writeTestTaskMessage } from '@heynixie/tasks/test-utils';
import { readBinding } from '../session/read-binding';
import { startTestCoding } from '../test-utils/start-test-coding';
import { readStepFacts } from './read-step-facts';
import type { InboxItem } from './to-inbox-item';

async function setupTest() {
  const ctx = await startTestCoding();
  const claim = await ctx.claimConversation();

  const startSession = async (): Promise<string> => {
    const started = await ctx.callTool(claim, 'task.start', {
      runner: 'atc',
      name: 'Fix the flaky login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
    });

    const taskID = started.outcome.status === 'ok' ? String(started.outcome.result['taskID']) : '';

    await ctx.runActions();
    await ctx.runSteps();

    return taskID;
  };

  const sendNote = async (taskID: string, body: string): Promise<string | null> => {
    const sent = await writeTestTaskMessage(
      ctx.context,
      {
        hopLimit: 6,
        directory: [
          { taskID, name: 'Login fix', brief: '', wakeable: true, speaker: 'plain_task' },
        ],
      },
      {
        from: 'conversation',
        to: taskID,
        kind: 'request',
        body,
        replyTo: null,
        onBehalfOf: [],
        wake: true,
      },
    );

    await ctx.runSteps();
    await ctx.runActions();
    await ctx.runSteps();

    return sent.status === 'sent' ? sent.messageID : null;
  };

  return {
    ...ctx,
    seed: { session: startSession, deliveredNote: sendNote },
    readQueuedActionIDs: async (taskID: string) => {
      const entries = await readRecords(ctx.log, {
        afterSequence: 0,
        thread: taskID,
        kinds: ['action.queued'],
      });

      return entries.map((entry) => String(entry.record.payload['actionID']));
    },
    readFacts: async (taskID: string, inbox: readonly InboxItem[]) =>
      readStepFacts(ctx.log, {
        taskID,
        adapterID: 'atc',
        binding: await readBinding(ctx.log.writer.db, taskID),
        inbox,
      }),
  };
}

test('it reads only the delivered note and the queued input that the inbox names', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();

  await ctx.seed.deliveredNote(taskID, 'Is the retry count still 3?');

  const secondID = await ctx.seed.deliveredNote(taskID, 'Which branch holds the fix?');
  const actionIDs = await ctx.readQueuedActionIDs(taskID);

  const secondAction = actionIDs[2] ?? '';

  const facts = await ctx.readFacts(taskID, [
    {
      kind: 'outcome',
      sequence: 900,
      actionID: secondAction,
      tool: 'coding.message',
      status: 'done',
      result: { messageRef: 'note-2' },
      reason: 'done',
    },
    {
      kind: 'event',
      sequence: 901,
      event: {
        session: 'cloud.3f9a1c2e.00000001',
        eventKey: 'cloud|2',
        at: '2027-03-09T10:00:00.000Z',
        kind: 'answered',
        messageRef: 'note-2',
        answer: 'The fix is on main.',
      },
      state: null,
    },
  ]);

  expect({ queued: facts.queued, delivered: facts.delivered }).toStrictEqual({
    queued: new Map([[secondAction, { hop: 1, messageID: secondID, from: 'conversation' }]]),
    delivered: [{ messageRef: 'note-2', messageID: secondID, from: 'conversation' }],
  });
});
