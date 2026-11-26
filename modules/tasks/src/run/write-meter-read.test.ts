import { expect, test } from 'bun:test';
import { readSpendLedger } from '@heynixie/budgets';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from '../task/projection/claim-task';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readMeterReads } from './read-meter-reads';
import { readOpenRun } from './read-open-run';
import { taskMeterReadCodec } from './task-meter-read-codec';
import { writeMeterRead } from './write-meter-read';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  const taskID = await seedTask(tasks.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the task is ready to claim');

  const run = await readOpenRun(tasks.context.log.writer.db, taskID);

  invariant(run, 'the claim opened a task run');

  return {
    ...tasks,
    taskID,
    run,
    writeRead: (sandbox: string, reason: 'run_start' | 'step_end', countMicros: number) =>
      writeMeterRead(tasks.context, {
        taskID,
        taskRunID: run.runID,
        sandbox,
        reason,
        countMicros,
      }),
    readLedger: () => readSpendLedger(tasks.writer.db),
  };
}

test('it records the meter of the task run it opens', async () => {
  const ctx = await setupTest();

  expect(ctx.run.opened.meter).toBe('records');
});

test('it sets the ledger row of the task run to the count less the start count when it writes a read', async () => {
  const ctx = await setupTest();

  await ctx.writeRead('sandbox-1', 'run_start', 500_000);
  await ctx.writeRead('sandbox-1', 'step_end', 730_000);

  const ledger = await ctx.readLedger();

  expect(ledger).toStrictEqual([
    {
      counter: `task_run:${ctx.run.runID}`,
      unit: 'micros:USD',
      periodKind: 'none',
      periodStart: '',
      amount: 230_000,
    },
  ]);
});

test('it sums a replaced sandbox from zero beside the first', async () => {
  const ctx = await setupTest();

  await ctx.writeRead('sandbox-1', 'run_start', 500_000);
  await ctx.writeRead('sandbox-1', 'step_end', 600_000);
  await ctx.writeRead('sandbox-2', 'step_end', 40_000);

  const [row] = await ctx.readLedger();

  expect(row?.amount).toBe(140_000);
});

test('it keeps the row at the larger count when an older read lands late', async () => {
  const ctx = await setupTest();

  await ctx.writeRead('sandbox-1', 'run_start', 0);
  await ctx.writeRead('sandbox-1', 'step_end', 900_000);
  await ctx.writeRead('sandbox-1', 'step_end', 400_000);

  const [row] = await ctx.readLedger();

  expect(row?.amount).toBe(900_000);
});

test('it reads back the reads of the task run in the order they were written', async () => {
  const ctx = await setupTest();

  await ctx.writeRead('sandbox-1', 'run_start', 5);
  await ctx.writeRead('sandbox-1', 'step_end', 9);

  const reads = await readMeterReads(ctx.context, ctx.run);

  expect(reads).toStrictEqual([
    { sandbox: 'sandbox-1', reason: 'run_start', countMicros: 5 },
    { sandbox: 'sandbox-1', reason: 'step_end', countMicros: 9 },
  ]);
});

test('it rolls back the read with its ledger row when the write fails after the fold', async () => {
  const ctx = await setupTest();

  const attempt = withWriteTransaction(ctx.writer, async (tx) => {
    await writeRecordsInTransaction(tx, ctx.context.log, [
      {
        kind: taskMeterReadCodec.kind,
        definitions: ctx.context.definitions(),
        thread: ctx.taskID,
        payload: taskMeterReadCodec.encode({
          taskRunID: ctx.run.runID,
          sandbox: 'sandbox-1',
          reason: 'step_end',
          countMicros: 730_000,
        }),
      },
    ]);

    throw new Error('the write fails after the ledger folds');
  });

  await Promise.allSettled([attempt]);

  expect(attempt).rejects.toThrow('the write fails after the ledger folds');

  const reads = await readMeterReads(ctx.context, ctx.run);
  const ledger = await ctx.readLedger();

  expect(reads).toStrictEqual([]);
  expect(ledger).toStrictEqual([]);
});
