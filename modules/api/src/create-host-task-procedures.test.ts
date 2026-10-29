import { expect, test } from 'bun:test';
import { createConversationTask, createTask } from '@heynixie/tasks';
import { createRouterClient } from '@orpc/server';
import { createHostTaskProcedures } from './create-host-task-procedures';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  return { ...api, client: createRouterClient(createHostTaskProcedures(api.context)) };
}

test('#stop stops a ready task', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'sort the receipts');
  const stopped = await ctx.client.stop({ taskID });

  expect(stopped).toStrictEqual({ taskID, state: 'stopped', isPauseRequested: false });
});

test('#restart returns a stopped task to the state it was stopped in', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'sort the receipts');

  await ctx.client.stop({ taskID });

  const restarted = await ctx.client.restart({ taskID });

  expect(restarted).toStrictEqual({ taskID, state: 'ready', isPauseRequested: false });
});

test('#pause refuses a stopped task, naming its state', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'sort the receipts');

  await ctx.client.stop({ taskID });

  const refused = await ctx.client.pause({ taskID }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({
    code: 'TASK_STATE_REFUSED',
    message: `task ${taskID} is stopped, which does not take this control`,
  });
});

test('#resume refuses a task that does not exist', async () => {
  const ctx = await setupTest();

  const refused = await ctx.client.resume({ taskID: 'k3x9m2p7qa' }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({
    code: 'TASK_NOT_FOUND',
  });
});

test('#close refuses to close the conversation', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const refused = await ctx.client.close({ taskID: 'conversation' }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({
    code: 'CONVERSATION_NEVER_CLOSES',
  });
});

test('#interrupt refuses a task with no running step', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'sort the receipts');

  const refused = await ctx.client.interrupt({ taskID }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({
    code: 'TASK_STATE_REFUSED',
    message: `task ${taskID} is ready, which does not take this control`,
  });
});
