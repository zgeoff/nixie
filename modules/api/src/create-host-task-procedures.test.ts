import { expect, test } from 'bun:test';
import { pauseNixieInTransaction, readRecords, withWriteTransaction } from '@heynixie/log';
import { createConversationTask, createTask } from '@heynixie/tasks';
import { seedConversationStep, seedHeldTask } from '@heynixie/tasks/test-utils';
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

test('#resume refuses a task that its limit paused, naming the raise', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const refused = await ctx.client.resume({ taskID }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({
    code: 'TASK_STATE_REFUSED',
    message: `task ${taskID} reached its limit, and only a raise of the limit resumes it`,
  });
});

test('#raise resumes a task that its limit paused, under the raised limits', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const raised = await ctx.client.raise({ taskID, dollars: 3 });

  expect(raised).toStrictEqual({
    taskID,
    state: 'ready',
    isPauseRequested: false,
    turns: 3,
    dollars: 3,
  });
});

test('#raise refuses a task that its limit does not hold', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'sort the receipts');

  const refused = await ctx.client.raise({ taskID, turns: 9 }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({ code: 'TASK_NOT_AT_LIMIT', status: 409 });
});

test('#raise refuses limits that are not above the old ones', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const refused = await ctx.client.raise({ taskID, turns: 3 }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({ code: 'LIMIT_NOT_RAISED', status: 409 });
});

test('#raise refuses a task that does not exist', async () => {
  const ctx = await setupTest();

  const refused = await ctx.client.raise({ taskID: 'k3vq8m2xpa', turns: 9 }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 });
});

test('#resume exempts a ready task while nixie is paused, by the host', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'sort the receipts');

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.context.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'host',
      definitions: ctx.context.definitions(),
    }),
  );

  const resumed = await ctx.client.resume({ taskID });

  const exempted = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['nixie.task_exempted'],
  });

  expect(resumed).toStrictEqual({ taskID, state: 'ready', isPauseRequested: false });
  expect(exempted.map((read) => read.record.payload)).toStrictEqual([{ taskID, by: 'host' }]);
});
