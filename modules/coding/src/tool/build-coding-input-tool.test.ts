import { expect, test } from 'bun:test';
import { readTestActions } from '@heynixie/actions/test-utils';
import { readRecords } from '@heynixie/log';
import { readBinding } from '../session/read-binding';
import { startTestCoding } from '../test-utils/start-test-coding';

async function setupTest() {
  const ctx = await startTestCoding();
  const claim = await ctx.claimConversation();

  return {
    ...ctx,
    claim,
    seed: {
      session: async (): Promise<string> => {
        const started = await ctx.callTool(claim, 'task.start', {
          runner: 'atc',
          name: 'Fix the flaky login test',
          brief: 'Find why the login test fails.',
          repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
        });

        const taskID =
          started.outcome.status === 'ok' ? String(started.outcome.result['taskID']) : '';

        await ctx.runActions();
        await ctx.runSteps();

        return taskID;
      },
    },
    readActions: () => readTestActions(ctx.log.writer),
    readHop: async (taskID: string) => {
      const binding = await readBinding(ctx.log.writer.db, taskID);

      return binding?.hop;
    },
    readMessagesTo: async (thread: string) => {
      const entries = await readRecords(ctx.log, {
        afterSequence: 0,
        thread,
        kinds: ['task_message'],
      });

      return entries.map((entry) =>
        entry.record.erasable.status === 'readable' ? entry.record.erasable.fields['body'] : null,
      );
    },
  };
}

test('#coding.steer types the text into the session as one input, and records the steer', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();

  const steered = await ctx.callTool(ctx.claim, 'coding.steer', {
    task: taskID,
    text: 'Stop changing the retry count.\nFind why the cookie expires.',
  });

  await ctx.runActions();
  await ctx.runSteps();

  const [, steer] = await ctx.readActions();

  expect({
    steered: steered.outcome,
    typed: ctx.adapter.calls.filter((call) => call.method === 'steer'),
    action: steer,
  }).toStrictEqual({
    steered: {
      status: 'ok',
      result: {
        status: 'pending',
        actionID: steer?.actionID ?? 'missing',
        message: `queued as \`${steer?.actionID ?? 'missing'}\``,
      },
    },
    typed: [
      {
        method: 'steer',
        session: 'cloud.3f9a1c2e.00000001',
        idempotencyKey: null,
        text: 'Stop changing the retry count.\nFind why the cookie expires.',
      },
    ],
    action: expect.objectContaining({ tool: 'coding.steer', status: 'done', taskID }),
  });
});

test('#coding.steer fails, and the step tells the report target, while the session waits on a menu', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.00000001',
    state: 'waiting',
    question: 'Allow Bash: rm -rf build?',
    isMenuOpen: true,
  });

  await ctx.callTool(ctx.claim, 'coding.steer', { task: taskID, text: 'Go on.' });
  await ctx.runActions();
  await ctx.runSteps();

  const [, steer] = await ctx.readActions();

  expect({
    status: steer?.status,
    messages: await ctx.readMessagesTo('conversation'),
  }).toStrictEqual({
    status: 'failed',
    messages: ['The coding session did not get the steer: menu_open.'],
  });
});

test('#coding.steer refuses a text over 32,000 characters', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();

  const steered = await ctx.callTool(ctx.claim, 'coding.steer', {
    task: taskID,
    text: 'a'.repeat(32_001),
  });

  expect(steered.outcome).toMatchObject({ status: 'error' });
});

test('#coding.message refuses a task that is no coding task', async () => {
  const ctx = await setupTest();

  const sent = await ctx.callTool(ctx.claim, 'coding.message', {
    task: 'conversation',
    text: 'FYI: the CI fix landed.',
  });

  expect(sent.outcome).toStrictEqual({
    status: 'error',
    message: 'The task conversation is no coding task.',
  });
});

test('#coding.message sends a note under the action key, and moves the hop to the calling turn', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();

  await ctx.callTool(ctx.claim, 'coding.message', {
    task: taskID,
    text: 'FYI: the CI fix for the cache landed on main.',
  });

  await ctx.runActions();
  await ctx.runSteps();

  const [, note] = await ctx.readActions();

  expect({
    sent: ctx.adapter.calls.filter((call) => call.method === 'message'),
    hop: await ctx.readHop(taskID),
  }).toStrictEqual({
    sent: [
      {
        method: 'message',
        session: 'cloud.3f9a1c2e.00000001',
        idempotencyKey: note?.actionID ?? 'missing',
        text: 'FYI: the CI fix for the cache landed on main.',
      },
    ],
    hop: 0,
  });
});
