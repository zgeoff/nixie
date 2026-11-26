import { expect, test } from 'bun:test';
import { pauseNixieInTransaction, readRecords, withWriteTransaction } from '@heynixie/log';
import { createConversationTask, createTask, readEndedRuns, writeMeterRead } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import { createRouterClient } from '@orpc/server';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestAPI } from '../test-utils/start-test-api';
import { createHostTaskProcedures } from './create-host-task-procedures';

async function setupTest(options: Parameters<typeof startTestAPI>[1] = {}) {
  const api = await startTestAPI(undefined, options);

  return {
    ...api,
    client: createRouterClient(createHostTaskProcedures(api.context)),
    seed: buildSeeder(api),
  };
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

  const settled = await Promise.allSettled([ctx.client.pause({ taskID })]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'TASK_STATE_REFUSED',
        message: `task ${taskID} is stopped, which does not take this control`,
      },
    },
  ]);
});

test('#resume refuses a task that does not exist', async () => {
  const ctx = await setupTest();
  const settled = await Promise.allSettled([ctx.client.resume({ taskID: 'k3x9m2p7qa' })]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'TASK_NOT_FOUND',
      },
    },
  ]);
});

test('#close refuses to close the conversation', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const settled = await Promise.allSettled([ctx.client.close({ taskID: 'conversation' })]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'CONVERSATION_NEVER_CLOSES',
      },
    },
  ]);
});

test('#interrupt refuses a task with no running step', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'sort the receipts');
  const settled = await Promise.allSettled([ctx.client.interrupt({ taskID })]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'TASK_STATE_REFUSED',
        message: `task ${taskID} is ready, which does not take this control`,
      },
    },
  ]);
});

test('#resume refuses a task that its limit paused, naming the raise', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.pausedTask({
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const settled = await Promise.allSettled([ctx.client.resume({ taskID })]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'TASK_STATE_REFUSED',
        message: `task ${taskID} reached its limit, and only a raise of the limit resumes it`,
      },
    },
  ]);
});

test('#raise resumes a task that its limit paused, under the raised limits', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.pausedTask({
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
  const settled = await Promise.allSettled([ctx.client.raise({ taskID, turns: 9 })]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'TASK_NOT_AT_LIMIT',
        status: 409,
      },
    },
  ]);
});

test('#raise refuses limits that are not above the old ones', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.pausedTask({
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const settled = await Promise.allSettled([ctx.client.raise({ taskID, turns: 3 })]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'LIMIT_NOT_RAISED',
        status: 409,
      },
    },
  ]);
});

test('#raise refuses a task that does not exist', async () => {
  const ctx = await setupTest();
  const settled = await Promise.allSettled([ctx.client.raise({ taskID: 'k3vq8m2xpa', turns: 9 })]);

  expect(settled).toMatchObject([
    {
      status: 'rejected',
      reason: {
        code: 'TASK_NOT_FOUND',
        status: 404,
      },
    },
  ]);
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

test('#raise sets the limit of the sandbox the gateway counts for the task, after the raise commits', async () => {
  const ctx = await setupTest({ isSpendOn: true, isGatewayMetered: true });
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.pausedTask({
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const [run] = await readEndedRuns(ctx.context, { taskID, limit: 1 });

  invariant(run);

  await writeMeterRead(ctx.context, {
    taskID,
    taskRunID: run.runID,
    sandbox: 'sandbox-1',
    reason: 'step_end',
    countMicros: 250_000,
  });

  await ctx.client.raise({ taskID, dollars: 3 });

  await waitForCondition(() => ctx.spendGateway.patchSandbox.mock.calls.length === 1);

  expect(ctx.spendGateway.patchSandbox.mock.calls).toStrictEqual([
    ['sandbox-1', { dollars: 3.25 }],
  ]);
});

test('#raise sets the limit again after the gateway did not answer the first call', async () => {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const ctx = await setupTest({ isSpendOn: true, isGatewayMetered: true, writerClock: clock });
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.pausedTask({
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const [run] = await readEndedRuns(ctx.context, { taskID, limit: 1 });

  invariant(run);

  await writeMeterRead(ctx.context, {
    taskID,
    taskRunID: run.runID,
    sandbox: 'sandbox-1',
    reason: 'step_end',
    countMicros: 250_000,
  });

  ctx.spendGateway.patchSandbox.mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' });

  const raised = await ctx.client.raise({ taskID, dollars: 3 });

  await waitForCondition(() => clock.countPending() === 1);

  clock.advance(5000);

  await waitForCondition(() => ctx.spendGateway.patchSandbox.mock.calls.length === 2);

  expect(raised).toMatchObject({ state: 'ready', dollars: 3 });

  expect(ctx.spendGateway.patchSandbox.mock.calls).toStrictEqual([
    ['sandbox-1', { dollars: 3.25 }],
    ['sandbox-1', { dollars: 3.25 }],
  ]);
});

test('#raise sets no limit on the retry once a step has read the sandbox again and set its own', async () => {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const ctx = await setupTest({ isSpendOn: true, isGatewayMetered: true, writerClock: clock });
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.pausedTask({
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  const [run] = await readEndedRuns(ctx.context, { taskID, limit: 1 });

  invariant(run);

  await writeMeterRead(ctx.context, {
    taskID,
    taskRunID: run.runID,
    sandbox: 'sandbox-1',
    reason: 'step_end',
    countMicros: 250_000,
  });

  ctx.spendGateway.patchSandbox.mockResolvedValueOnce({ kind: 'unreachable', reason: 'no answer' });

  await ctx.client.raise({ taskID, dollars: 3 });

  await waitForCondition(() => clock.countPending() === 1);

  await writeMeterRead(ctx.context, {
    taskID,
    taskRunID: run.runID,
    sandbox: 'sandbox-1',
    reason: 'step_start',
    countMicros: 300_000,
  });

  clock.advance(5000);

  await waitForCondition(() => ctx.logged.some((line) => line.includes('sandbox_limit_stale')));

  expect(ctx.spendGateway.patchSandbox.mock.calls).toStrictEqual([
    ['sandbox-1', { dollars: 3.25 }],
  ]);
});

test('#raise sets no sandbox limit for a task run that no gateway counts', async () => {
  const ctx = await setupTest({ isSpendOn: true });
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.pausedTask({
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  await ctx.client.raise({ taskID, dollars: 3 });

  expect(ctx.spendGateway.patchSandbox.mock.calls).toStrictEqual([]);
});
