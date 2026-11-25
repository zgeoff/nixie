import { expect, test } from 'bun:test';
import type { StartedClaim } from '@heynixie/tasks';
import { startTestCoding } from '../test-utils/start-test-coding';

async function setupTest() {
  const ctx = await startTestCoding();

  return {
    ...ctx,
    joinSession: async (claim: StartedClaim) => {
      const listed = await ctx.callTool(claim, 'coding.sessions', {});

      const session = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'];

      const taskID = await ctx.startTask(claim, {
        name: 'Your billing refactor',
        brief: 'Watch for a question.',
        session,
      });

      await ctx.runActions();
      await ctx.runSteps();

      return taskID;
    },
  };
}

test('it reads the state, the question and the last reply cut to its end, with no prompt or tail unless asked', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'waiting',
    question: 'Which branch should I rebase on?',
    lastReply: `${'a'.repeat(500)}${'b'.repeat(2000)}`,
    prompt: 'Refactor the billing module.',
    turns: [{ user: 'Refactor the billing module.', assistant: 'Done.', tools: ['Edit'] }],
  });

  const taskID = await ctx.joinSession(claim);
  const read = await ctx.callTool(claim, 'coding.read', { task: taskID });

  expect(read.outcome).toStrictEqual({
    status: 'ok',
    result: {
      state: 'waiting',
      question: 'Which branch should I rebase on?',
      lastReply: { text: 'b'.repeat(2000), cut: true },
    },
  });
});

test('it reads the prompt and the last turns when asked', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
    lastReply: 'The refactor is done.',
    prompt: 'Refactor the billing module.',
    turns: [
      { user: 'Refactor the billing module.', assistant: 'Started.', tools: ['Read'] },
      { user: 'Use the new invoice type.', assistant: 'Switched.', tools: ['Edit'] },
      { user: 'Run the tests.', assistant: 'The refactor is done.', tools: ['Bash'] },
    ],
  });

  const taskID = await ctx.joinSession(claim);
  const read = await ctx.callTool(claim, 'coding.read', { task: taskID, prompt: true, tail: 2 });

  expect(read.outcome).toStrictEqual({
    status: 'ok',
    result: {
      state: 'idle',
      question: null,
      lastReply: { text: 'The refactor is done.', cut: false },
      prompt: { text: 'Refactor the billing module.', cut: false },
      tail: {
        turns: [
          { user: 'Use the new invoice type.', assistant: 'Switched.', tools: ['Edit'] },
          { user: 'Run the tests.', assistant: 'The refactor is done.', tools: ['Bash'] },
        ],
        cut: false,
      },
    },
  });
});

test('it reads the tail as unsupported for a system that keeps no transcript', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'running',
    turns: 'unsupported',
  });

  const taskID = await ctx.joinSession(claim);
  const read = await ctx.callTool(claim, 'coding.read', { task: taskID, tail: 1 });

  expect(read.outcome).toStrictEqual({
    status: 'ok',
    result: { state: 'running', question: null, lastReply: null, tail: { unsupported: true } },
  });
});

test('it refuses a task that is no coding task', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();
  const read = await ctx.callTool(claim, 'coding.read', { task: 'conversation' });

  expect(read.outcome).toStrictEqual({
    status: 'error',
    message: 'The task conversation is no coding task.',
  });
});

test('it refuses a coding task whose spawn has not run yet', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const taskID = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  const read = await ctx.callTool(claim, 'coding.read', { task: taskID });

  expect(read.outcome).toStrictEqual({
    status: 'error',
    message: `The task ${taskID} has no session yet. Try again once it starts.`,
  });
});

test('it refuses a coding task that is done', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.replyNext('start', { status: 'refused', canClear: false, reason: 'bad_args' });

  const taskID = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await ctx.runActions();
  await ctx.runSteps();

  const read = await ctx.callTool(claim, 'coding.read', { task: taskID });

  expect(read.outcome).toStrictEqual({
    status: 'error',
    message: `The task ${taskID} is done.`,
  });
});

test('it gives an error outcome with the reason when the system refuses the read', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const taskID = await ctx.joinSession(claim);

  ctx.adapter.replyNext('read', { status: 'unknown', reason: 'timeout' });

  const read = await ctx.callTool(claim, 'coding.read', { task: taskID });

  expect(read.outcome).toStrictEqual({
    status: 'error',
    message: 'nixie could not read the session: timeout.',
  });
});
