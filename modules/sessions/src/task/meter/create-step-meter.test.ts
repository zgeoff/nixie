import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import { modelTurnEndedCodec } from '@heynixie/models';
import { buildStubSpendGateway } from '@heynixie/spend/test-utils';
import { claimTask, readMeterReads, readOpenRun } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildCountAnswer } from '../../test-utils/build-count-answer';
import { buildSeeder } from '../../test-utils/build-seeder';
import { startTestTasks } from '../../test-utils/start-test-tasks';
import { workerTurnEndedCodec } from '../../worker/worker-turn-ended-codec';
import { buildDollarsMeter } from '../build-dollars-meter';
import { buildTurnsMeter } from '../build-turns-meter';
import { createStepMeter } from './create-step-meter';

async function setupTest() {
  const tasks = await startTestTasks();

  const seed = buildSeeder(tasks);

  const starter = await seed.conversationStep();

  const taskID = await seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 3 },
    },
  });

  const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the started task is ready to claim');

  const run = await readOpenRun(tasks.context.log.writer.db, taskID);

  invariant(run, 'the claim opened a task run');

  // a task run that began before its start record named a meter
  const { meter: _, ...legacyOpened } = run.opened;
  const gateway = buildStubSpendGateway();

  const context = {
    ...tasks.context,
    runSettings: {
      ...tasks.context.runSettings,
      meters: [buildTurnsMeter(), buildDollarsMeter(() => null)] as const,
    },
  };

  return {
    tasks,
    context,
    taskID,
    gateway,
    legacyRun: { ...run, opened: legacyOpened },
    meter: (taskRun: typeof run) =>
      createStepMeter(
        { context, gateway, logger: mock<Logger>(() => {}) },
        { taskRun, used: { turns: 0, dollars: 0 }, prices: null },
      ),
    recordsMeter: () =>
      createStepMeter(
        { context, gateway: undefined, logger: mock<Logger>(() => {}) },
        {
          taskRun: { ...run, opened: { ...run.opened, meter: 'records' as const } },
          used: { turns: 0, dollars: 0 },
          prices: { input: 3, cacheWrite: 3.75, cacheWrite1h: 6, cachedInput: 0.3, output: 15 },
        },
      ),
    writeLegacyTurn: (dollars: number) =>
      writeRecords(tasks.context.log, [
        {
          kind: modelTurnEndedCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          thread: taskID,
          payload: modelTurnEndedCodec.encode({
            model: 'claude-test',
            profile: 'router-b',
            stopReason: 'end_turn',
            turns: 1,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            pinnedCore: [],
            retrieved: [],
            invalidatedThrough: 0,
            sessionImageBytes: 0,
            sessionImageCount: 0,
            dollars,
          }),
        },
      ]),
    writeWorkerTurn: (taskRunID: string, dollars: number) =>
      writeRecords(tasks.context.log, [
        {
          kind: workerTurnEndedCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          thread: taskID,
          payload: workerTurnEndedCodec.encode({
            workerRunID: crypto.randomUUID(),
            callID: crypto.randomUUID(),
            taskRunID,
            model: 'claude-worker-test',
            profile: 'worker-direct',
            turn: 1,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            dollars,
          }),
          erasable: { text: 'Found 3 cafes.' },
        },
      ]),
  };
}

test('it moves a task run from before the meter reads to the gateway, and keeps the dollars its records hold', async () => {
  const ctx = await setupTest();

  await ctx.writeLegacyTurn(0.4);
  await ctx.writeWorkerTurn(ctx.legacyRun.runID, 0.1);

  ctx.gateway.readSandbox
    .mockResolvedValueOnce(buildCountAnswer(2))
    .mockResolvedValueOnce(buildCountAnswer(2.25));

  const meter = ctx.meter(ctx.legacyRun);

  const begun = await meter.begin('sandbox-1');
  const ended = await meter.end('sandbox-1', 0, 0);
  const reads = await readMeterReads(ctx.context, ctx.legacyRun);

  expect(begun.kind).toBe('ready');

  expect(reads).toStrictEqual([
    { sandbox: ctx.taskID, reason: 'step_start', countMicros: 400_000 },
    { sandbox: 'sandbox-1', reason: 'run_start', countMicros: 2_000_000 },
    { sandbox: 'sandbox-1', reason: 'step_end', countMicros: 2_250_000 },
  ]);

  expect(ended.used.dollars).toBe(0.75);
});

test('it sets the sandbox limit of a moved task run from what its records leave of the limit', async () => {
  const ctx = await setupTest();

  await ctx.writeLegacyTurn(0.5);

  ctx.gateway.readSandbox.mockResolvedValueOnce(buildCountAnswer(2));

  await ctx.meter(ctx.legacyRun).begin('sandbox-1');

  expect(ctx.gateway.patchSandbox.mock.calls).toStrictEqual([['sandbox-1', { dollars: 4.5 }]]);
});

test('it writes only the sandbox read for a task run from before the reads whose records hold no dollars', async () => {
  const ctx = await setupTest();

  ctx.gateway.readSandbox.mockResolvedValueOnce(buildCountAnswer(2));

  await ctx.meter(ctx.legacyRun).begin('sandbox-1');

  const reads = await readMeterReads(ctx.context, ctx.legacyRun);

  expect(reads).toStrictEqual([
    { sandbox: 'sandbox-1', reason: 'run_start', countMicros: 2_000_000 },
  ]);
});

test('it gives each of two worker runs that start together on the records meter what the other left', async () => {
  const ctx = await setupTest();
  const begun = await ctx.recordsMeter().begin('sandbox-1');

  invariant(begun.kind === 'ready', 'the step begins');

  const grants = await Promise.all([
    begun.budget.onWorkerStart?.(2),
    begun.budget.onWorkerStart?.(2),
  ]);

  expect(grants).toStrictEqual([2, 1]);
  expect(begun.budget.getLeftDollars()).toBe(0);
});

test('it frees the dollars a worker run planned and did not spend on the records meter', async () => {
  const ctx = await setupTest();
  const begun = await ctx.recordsMeter().begin('sandbox-1');

  invariant(begun.kind === 'ready', 'the step begins');

  await begun.budget.onWorkerStart?.(2);

  begun.budget.onSpend(0.5);

  await begun.budget.onWorkerEnd?.({ plannedDollars: 2, chargedDollars: 0.5 });

  expect(begun.budget.getLeftDollars()).toBe(2.5);
});
