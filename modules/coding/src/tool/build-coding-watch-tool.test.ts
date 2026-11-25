import { expect, test } from 'bun:test';
import type { StartedClaim } from '@heynixie/tasks';
import { readBinding } from '../session/read-binding';
import { startTestCoding } from '../test-utils/start-test-coding';

async function setupTest() {
  const ctx = await startTestCoding();

  return {
    ...ctx,
    readBinding: (taskID: string) => readBinding(ctx.log.writer.db, taskID),
    joinSession: async (claim: StartedClaim) => {
      const listed = await ctx.callTool(claim, 'coding.sessions', {});

      const session = /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'];

      const taskID = await ctx.startTask(claim, {
        runner: 'atc',
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

test('it writes the new wake set of a coding task', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const taskID = await ctx.joinSession(claim);

  const watched = await ctx.callTool(claim, 'coding.watch', {
    task: taskID,
    wake: ['progress', 'decision', 'progress'],
  });

  expect(watched.outcome).toStrictEqual({
    status: 'ok',
    result: { wake: ['progress', 'decision'] },
  });

  const binding = await ctx.readBinding(taskID);

  expect(binding?.wake).toStrictEqual(['progress', 'decision']);
});

test('it writes an empty wake set', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.7c1d0e55',
    name: 'billing refactor',
    state: 'idle',
  });

  const taskID = await ctx.joinSession(claim);
  const watched = await ctx.callTool(claim, 'coding.watch', { task: taskID, wake: [] });

  expect(watched.outcome).toStrictEqual({ status: 'ok', result: { wake: [] } });

  const binding = await ctx.readBinding(taskID);

  expect(binding?.wake).toStrictEqual([]);
});

test('it refuses a task that does not exist', async () => {
  const ctx = await setupTest();
  const claim = await ctx.claimConversation();

  const watched = await ctx.callTool(claim, 'coding.watch', {
    task: 'task-missing',
    wake: ['waiting'],
  });

  expect(watched.outcome).toStrictEqual({
    status: 'error',
    message: 'The task task-missing is no coding task.',
  });
});
