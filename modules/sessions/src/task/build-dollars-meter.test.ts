import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { modelSessionSummarizedCodec, modelTurnEndedCodec } from '@heynixie/models';
import {
  claimTask,
  readOpenRun,
  taskFailedTurnSpentCodec,
  writeFailedTurnSpend,
} from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { buildDollarsMeter } from './build-dollars-meter';

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

  return {
    tasks,
    run,
    writeTurn: (tokens: Partial<Record<string, number>>) =>
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
          }),
        },
      ]),
    readDollars: () =>
      buildDollarsMeter(() => ({
        input: 3,
        cacheWrite: 3.75,
        cacheWrite1h: 6,
        cachedInput: 0.3,
        output: 15,
      })).read(tasks.context, run),
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

test('it counts the dollars of a turn that left no turn record', async () => {
  const ctx = await setupTest();

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: ctx.run.taskID,
    taskRunID: ctx.run.runID,
    dollars: 0.25,
  });

  const dollars = await ctx.readDollars();

  expect(dollars).toBeCloseTo(0.25, 10);
});

test("it leaves out the spend that another task run's turn recorded", async () => {
  const ctx = await setupTest();

  await writeFailedTurnSpend(ctx.tasks.context, {
    taskID: ctx.run.taskID,
    taskRunID: 'an-earlier-run',
    dollars: 0.5,
  });

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
