import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import type { RunMeter } from '@heynixie/tasks';
import { claimTask, readOpenRun, writeFailedTurnSpend } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { workerGatewayChargedCodec } from '../worker/worker-gateway-charged-codec';
import { workerRunStartedCodec } from '../worker/worker-run-started-codec';
import { workerTurnEndedCodec } from '../worker/worker-turn-ended-codec';
import { buildDollarsMeter } from './build-dollars-meter';
import { readLateSpend } from './read-late-spend';
import { readRunUsage } from './read-run-usage';

async function setupTest() {
  const tasks = await startTestTasks();

  const seed = buildSeeder(tasks);

  return {
    tasks,
    seed,
    startRun: async () => {
      const starter = await seed.conversationStep();

      const taskID = await seed.task({
        starter: starter.claim,
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
      });

      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the started task is ready to claim');

      const run = await readOpenRun(tasks.context.log.writer.db, taskID);

      invariant(run, 'the claim opened a task run');

      return run;
    },
  };
}

test('it sums only the spend of the task run past the sequence', async () => {
  const ctx = await setupTest();
  const run = await ctx.startRun();

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: run.runID,
    dollars: 0.04,
  });

  const usage = await readRunUsage(ctx.tasks.context, run);

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: run.runID,
    dollars: 0.01,
  });

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: 'an-earlier-run',
    dollars: 0.5,
  });

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: run.runID,
    dollars: 0.02,
  });

  const dollars = await readLateSpend(ctx.tasks.context, run, usage.throughSequence, 'step-a');

  expect(dollars).toBeCloseTo(0.03, 10);
});

test('it reads no spend when none was recorded past the sequence', async () => {
  const ctx = await setupTest();
  const run = await ctx.startRun();

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: run.taskID,
    taskRunID: run.runID,
    dollars: 0.04,
  });

  const usage = await readRunUsage(ctx.tasks.context, run);
  const dollars = await readLateSpend(ctx.tasks.context, run, usage.throughSequence, 'step-a');

  expect(dollars).toBe(0);
});

test('it counts the dollars of a worker that another step started, and none of a worker the calling step started', async () => {
  const ctx = await setupTest();
  const run = await ctx.startRun();

  const otherWorkerRunID = crypto.randomUUID();
  const ownWorkerRunID = crypto.randomUUID();
  const definitions = { snapshotHash: 'sha256:test' };

  await writeRecords(
    ctx.tasks.context.log,
    [
      { workerRunID: otherWorkerRunID, stepRunID: 'step-b' },
      { workerRunID: ownWorkerRunID, stepRunID: 'step-a' },
    ].map((worker) => ({
      kind: 'worker.run_started' as const,
      definitions,
      thread: run.taskID,
      payload: workerRunStartedCodec.encode({
        workerRunID: worker.workerRunID,
        shortID: 'w3k8',
        callID: crypto.randomUUID(),
        stepRunID: worker.stepRunID,
        taskRunID: run.runID,
        model: 'claude-test-1',
        profile: 'worker',
        tools: [],
        limits: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
        isTaskLimit: false,
      }),
    })),
  );

  const usage = await readRunUsage(ctx.tasks.context, run);

  await writeRecords(
    ctx.tasks.context.log,
    [otherWorkerRunID, ownWorkerRunID].map((workerRunID) => ({
      kind: 'worker.turn_ended' as const,
      definitions,
      thread: run.taskID,
      payload: workerTurnEndedCodec.encode({
        workerRunID,
        callID: crypto.randomUUID(),
        taskRunID: run.runID,
        model: 'claude-test-1',
        profile: 'worker',
        turn: 1,
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        dollars: 0.01,
      }),
      erasable: { text: 'Found 3 cafes.' },
    })),
  );

  const dollars = await readLateSpend(ctx.tasks.context, run, usage.throughSequence, 'step-a');

  expect(dollars).toBeCloseTo(0.01, 10);
});

test('it counts no dollars of a worker that a task run other than this one started', async () => {
  const ctx = await setupTest();
  const run = await ctx.startRun();
  const usage = await readRunUsage(ctx.tasks.context, run);

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'worker.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: run.taskID,
      payload: workerTurnEndedCodec.encode({
        workerRunID: crypto.randomUUID(),
        callID: crypto.randomUUID(),
        taskRunID: 'an-earlier-run',
        model: 'claude-test-1',
        profile: 'worker',
        turn: 1,
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        dollars: 0.5,
      }),
      erasable: { text: 'Found 3 cafes.' },
    },
  ]);

  const dollars = await readLateSpend(ctx.tasks.context, run, usage.throughSequence, 'step-a');

  expect(dollars).toBe(0);
});

test('it counts a charge that lands while the meters read once, in the meters or in the late spend', async () => {
  const ctx = await setupTest();
  const run = await ctx.startRun();

  const landing: Promise<unknown>[] = [];
  const state = { isLanded: false };
  const realDollars = buildDollarsMeter(() => null);

  const dollars: RunMeter = {
    ...realDollars,
    read: async (readContext, readRun) => {
      landing.push(
        (async () => {
          await writeFailedTurnSpend(ctx.tasks.context, {
            taskID: run.taskID,
            taskRunID: run.runID,
            dollars: 0.01,
          });

          state.isLanded = true;
        })(),
      );

      // A read that holds the writer keeps the charge from landing, so the wait ends at its limit.
      await waitForCondition(() => state.isLanded, { timeoutMs: 200 }).catch(() => {});

      return realDollars.read(readContext, readRun);
    },
  };

  const context = {
    ...ctx.tasks.context,
    runSettings: {
      ...ctx.tasks.context.runSettings,
      meters: [ctx.tasks.context.runSettings.meters[0], dollars] as const,
    },
  };

  const usage = await readRunUsage(context, run);

  await Promise.all(landing);

  const late = await readLateSpend(ctx.tasks.context, run, usage.throughSequence, 'step-a');

  expect(usage.used.dollars + late).toBeCloseTo(0.01, 10);
});

test('it counts the gateway dollars of a worker that another step started, and none of a worker the calling step started', async () => {
  const ctx = await setupTest();
  const run = await ctx.startRun();

  const otherWorkerRunID = crypto.randomUUID();
  const ownWorkerRunID = crypto.randomUUID();
  const definitions = { snapshotHash: 'sha256:test' };

  await writeRecords(
    ctx.tasks.context.log,
    [
      { workerRunID: otherWorkerRunID, stepRunID: 'step-b' },
      { workerRunID: ownWorkerRunID, stepRunID: 'step-a' },
    ].map((worker) => ({
      kind: 'worker.run_started' as const,
      definitions,
      thread: run.taskID,
      payload: workerRunStartedCodec.encode({
        workerRunID: worker.workerRunID,
        shortID: 'w3k8',
        callID: crypto.randomUUID(),
        stepRunID: worker.stepRunID,
        taskRunID: run.runID,
        model: 'claude-test-1',
        profile: 'worker',
        tools: [],
        limits: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
        isTaskLimit: false,
      }),
    })),
  );

  const usage = await readRunUsage(ctx.tasks.context, run);

  await writeRecords(
    ctx.tasks.context.log,
    [otherWorkerRunID, ownWorkerRunID].map((workerRunID) => ({
      kind: 'worker.gateway_charged' as const,
      definitions,
      thread: run.taskID,
      payload: workerGatewayChargedCodec.encode({
        workerRunID,
        callID: crypto.randomUUID(),
        taskRunID: run.runID,
        dollars: 0.2,
      }),
    })),
  );

  const dollars = await readLateSpend(ctx.tasks.context, run, usage.throughSequence, 'step-a');

  expect(dollars).toBeCloseTo(0.2, 10);
});
