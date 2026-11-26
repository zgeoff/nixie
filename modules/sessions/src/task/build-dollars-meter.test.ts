import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { modelSessionSummarizedCodec, modelTurnEndedCodec } from '@heynixie/models';
import { claimTask, readOpenRun, taskFailedTurnSpentCodec, writeMeterRead } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { workerGatewayChargedCodec } from '../worker/worker-gateway-charged-codec';
import { workerTurnEndedCodec } from '../worker/worker-turn-ended-codec';
import { buildDollarsMeter } from './build-dollars-meter';

interface WorkerSpend {
  readonly taskRunID: string;
  readonly dollars: number;
}

async function setupTest() {
  const tasks = await startTestTasks();

  const seed = buildSeeder(tasks);

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

  // a task run that began before its start record named a meter
  const { meter: _, ...legacyOpened } = run.opened;
  const legacyRun = { ...run, opened: legacyOpened };

  return {
    tasks,
    run: legacyRun,
    meteredRun: run,
    writeTurn: (tokens: Partial<Record<string, number>>, dollars?: number) =>
      writeRecords(tasks.context.log, [
        {
          kind: modelTurnEndedCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          thread: taskID,
          payload: modelTurnEndedCodec.encode({
            model: 'claude-test',
            profile: 'task-direct',
            stopReason: 'end_turn',
            turns: 1,
            inputTokens: tokens['input'] ?? 0,
            outputTokens: tokens['output'] ?? 0,
            cacheReadTokens: tokens['cacheRead'] ?? 0,
            cacheWriteTokens: tokens['cacheWrite'] ?? 0,
            pinnedCore: [],
            retrieved: [],
            invalidatedThrough: 0,
            sessionImageBytes: 0,
            sessionImageCount: 0,
            ...(dollars === undefined ? {} : { dollars }),
          }),
        },
      ]),
    writeWorkerTurn: (worker: WorkerSpend) =>
      writeRecords(tasks.context.log, [
        {
          kind: workerTurnEndedCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          thread: taskID,
          payload: workerTurnEndedCodec.encode({
            workerRunID: crypto.randomUUID(),
            callID: crypto.randomUUID(),
            taskRunID: worker.taskRunID,
            model: 'claude-worker-test',
            profile: 'worker-direct',
            turn: 1,
            inputTokens: 5_000_000,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            dollars: worker.dollars,
          }),
          erasable: { text: 'Found 3 cafes.' },
        },
      ]),
    writeGatewayCharge: (worker: WorkerSpend) =>
      writeRecords(tasks.context.log, [
        {
          kind: workerGatewayChargedCodec.kind,
          definitions: { snapshotHash: 'sha256:test' },
          thread: taskID,
          payload: workerGatewayChargedCodec.encode({
            workerRunID: crypto.randomUUID(),
            callID: crypto.randomUUID(),
            taskRunID: worker.taskRunID,
            dollars: worker.dollars,
          }),
        },
      ]),
    readMeteredDollars: () => buildDollarsMeter(() => null).read(tasks.context, run),
    writeRead: (
      sandbox: string,
      reason: 'run_start' | 'step_end' | 'worker_end',
      countMicros: number,
    ) =>
      writeMeterRead(tasks.context, {
        taskID,
        taskRunID: run.runID,
        sandbox,
        reason,
        countMicros,
      }),
    readDollars: (inputPrice = 3) =>
      buildDollarsMeter(() => ({
        input: inputPrice,
        cacheWrite: 3.75,
        cacheWrite1h: 6,
        cachedInput: 0.3,
        output: 15,
      })).read(tasks.context, legacyRun),
  };
}

test('it prices the turns of the task run and the summaries of its session', async () => {
  const ctx = await setupTest();

  await ctx.writeTurn({ input: 1_000_000 });

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: modelSessionSummarizedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: ctx.run.taskID,
      payload: modelSessionSummarizedCodec.encode({
        model: 'claude-test',
        profile: 'task-direct',
        throughSequence: 1,
        boundary: { sessionID: 'session-a', messageID: 'message-a' },
        trigger: 'threshold',
        summaryTokens: 900,
        isCut: false,
        usage: { inputTokens: 0, outputTokens: 100_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
      }),
    },
  ]);

  const dollars = await ctx.readDollars();

  expect(dollars).toBeCloseTo(4.5, 10);
});

test("it prices a turn's cache reads at the cached rate and its cache writes at the longer lifetime's rate", async () => {
  const ctx = await setupTest();

  await ctx.writeTurn({ cacheRead: 1_000_000, cacheWrite: 1_000_000 });

  const dollars = await ctx.readDollars();

  expect(dollars).toBeCloseTo(6.3, 10);
});

test('it keeps the dollars that a turn recorded when the price of its tokens changes', async () => {
  const ctx = await setupTest();

  await ctx.writeTurn({ input: 1_000_000 }, 3);

  const dollars = await ctx.readDollars(6);

  expect(dollars).toBeCloseTo(3, 10);
});

test('it prices a turn that recorded no dollars by the price table now', async () => {
  const ctx = await setupTest();

  await ctx.writeTurn({ input: 1_000_000 });

  const dollars = await ctx.readDollars(6);

  expect(dollars).toBeCloseTo(6, 10);
});

test('it keeps the dollars that a summary recorded when the price of its tokens changes', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: modelSessionSummarizedCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: ctx.run.taskID,
      payload: modelSessionSummarizedCodec.encode({
        model: 'claude-test',
        profile: 'task-direct',
        throughSequence: 1,
        boundary: { sessionID: 'session-a', messageID: 'message-a' },
        trigger: 'threshold',
        summaryTokens: 900,
        isCut: false,
        usage: { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        dollars: 3,
      }),
    },
  ]);

  const dollars = await ctx.readDollars(6);

  expect(dollars).toBeCloseTo(3, 10);
});

test('it counts the dollars of a turn that left no turn record', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: taskFailedTurnSpentCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: ctx.run.taskID,
      payload: taskFailedTurnSpentCodec.encode({
        taskID: ctx.run.taskID,
        taskRunID: ctx.run.runID,
        dollars: 0.25,
      }),
    },
  ]);

  const dollars = await ctx.readDollars();

  expect(dollars).toBeCloseTo(0.25, 10);
});

test("it leaves out the spend that another task run's turn recorded", async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: taskFailedTurnSpentCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: ctx.run.taskID,
      payload: taskFailedTurnSpentCodec.encode({
        taskID: ctx.run.taskID,
        taskRunID: 'an-earlier-run',
        dollars: 0.5,
      }),
    },
  ]);

  const dollars = await ctx.readDollars();

  expect(dollars).toBe(0);
});

test('it counts a limit-ending turn once, though its commit holds the turn record and the budget tally', async () => {
  const ctx = await setupTest();

  await ctx.writeTurn({ input: 1_000_000 });

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: taskFailedTurnSpentCodec.kind,
      definitions: { snapshotHash: 'sha256:test' },
      thread: ctx.run.taskID,
      payload: taskFailedTurnSpentCodec.encode({
        taskID: ctx.run.taskID,
        taskRunID: ctx.run.runID,
        dollars: 3,
        besideTurnRecord: true,
      }),
    },
  ]);

  const dollars = await ctx.readDollars();

  expect(dollars).toBeCloseTo(3, 10);
});

test("it adds the stored dollars of a worker call, never its tokens priced on the task's profile", async () => {
  const ctx = await setupTest();

  await ctx.writeTurn({ input: 1_000_000 });
  await ctx.writeWorkerTurn({ taskRunID: ctx.run.runID, dollars: 0.06 });
  await ctx.writeWorkerTurn({ taskRunID: ctx.run.runID, dollars: 0.04 });

  const dollars = await ctx.readDollars();

  expect(dollars).toBeCloseTo(3.1, 10);
});

test("it leaves out the dollars of another task run's worker call", async () => {
  const ctx = await setupTest();

  await ctx.writeWorkerTurn({ taskRunID: 'an-earlier-run', dollars: 0.5 });

  const dollars = await ctx.readDollars();

  expect(dollars).toBe(0);
});

test('it adds the gateway dollars of a worker run above the priced calls of its turns', async () => {
  const ctx = await setupTest();

  await ctx.writeWorkerTurn({ taskRunID: ctx.run.runID, dollars: 0.06 });
  await ctx.writeGatewayCharge({ taskRunID: ctx.run.runID, dollars: 0.36 });

  const dollars = await ctx.readDollars();

  expect(dollars).toBeCloseTo(0.42, 10);
});

test("it leaves out the gateway dollars of another task run's worker", async () => {
  const ctx = await setupTest();

  await ctx.writeGatewayCharge({ taskRunID: 'an-earlier-run', dollars: 0.5 });

  const dollars = await ctx.readDollars();

  expect(dollars).toBe(0);
});

test("it counts a metered task run by its sandbox's count less the start count, and adds its worker runs", async () => {
  const ctx = await setupTest();

  await ctx.writeTurn({ input: 1_000_000 });
  await ctx.writeRead('sandbox-1', 'run_start', 500_000);
  await ctx.writeRead('sandbox-1', 'step_end', 750_000);
  await ctx.writeWorkerTurn({ taskRunID: ctx.meteredRun.runID, dollars: 0.5 });

  const dollars = await ctx.readMeteredDollars();

  expect(dollars).toBeCloseTo(0.75, 10);
});

test('it renders its limit with no dollar figure, for the code-made summary of a limit end', () => {
  const meter = buildDollarsMeter(() => null);

  expect(meter.render(2)).toBe('dollar');
});
