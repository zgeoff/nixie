import { expect, mock, test } from 'bun:test';
import type { RecordKind } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { writeStepCommit } from '../step/write-step-commit';
import { claimTask } from '../task/projection/claim-task';
import { writeTaskControl } from '../task/write-task-control';
import { buildTestRunSettings } from '../test-utils/build-test-run-settings';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { LeaseLostError } from '../utils/lease-lost-error';
import { readEndedRuns } from './read-ended-runs';
import { readMeterReads } from './read-meter-reads';
import { readOpenRun } from './read-open-run';
import type { SandboxMicrosRead } from './types';
import { writeMeterRead } from './write-meter-read';

async function setupTest() {
  const tasks = await startTestTasks();
  const starter = await seedConversationStep(tasks.context);

  const readSandboxMicros = mock<(sandbox: string) => Promise<SandboxMicrosRead>>(() =>
    Promise.resolve({ kind: 'ok', micros: 600_000 }),
  );

  const context = {
    ...tasks.context,
    runSettings: buildTestRunSettings({ meter: 'gateway', readSandboxMicros }),
  };

  const taskID = await seedTask(context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the task is ready to claim');

  const run = await readOpenRun(context.log.writer.db, taskID);

  invariant(run, 'the claim opened a task run');

  return {
    ...tasks,
    context,
    taskID,
    claim,
    run,
    readSandboxMicros,
    writeRead: (
      sandbox: string,
      reason: 'run_start' | 'step_end' | 'run_end',
      countMicros: number,
    ) => writeMeterRead(context, { taskID, taskRunID: run.runID, sandbox, reason, countMicros }),
    readKinds: async (kind: RecordKind) => {
      const entries = await readRecords(context.log, { afterSequence: 0, kinds: [kind] });

      return entries.map((entry) => entry.record);
    },
  };
}

test('it ends no task run, and commits no stop, while the gateway does not answer the end read', async () => {
  const ctx = await setupTest();

  await ctx.writeRead('sandbox-1', 'run_start', 100_000);
  await ctx.writeRead('sandbox-1', 'step_end', 400_000);

  ctx.readSandboxMicros.mockResolvedValue({ kind: 'unreachable' });

  const stopping = writeTaskControl(ctx.context, { taskID: ctx.taskID, control: 'stop' });

  await waitForCondition(() => ctx.clock.countPending() === 1);

  const ended = await ctx.readKinds('task.run_ended');
  const stopped = await ctx.readKinds('task.stopped');
  const open = await readOpenRun(ctx.context.log.writer.db, ctx.taskID);

  ctx.readSandboxMicros.mockResolvedValue({ kind: 'ok', micros: 600_000 });
  ctx.clock.advance(5000);

  await stopping;

  expect(ended).toStrictEqual([]);
  expect(stopped).toStrictEqual([]);
  expect(open?.runID).toBe(ctx.run.runID);
});

test('it writes the end read of the sandbox and the end of the task run together once the gateway answers', async () => {
  const ctx = await setupTest();

  await ctx.writeRead('sandbox-1', 'run_start', 100_000);
  await ctx.writeRead('sandbox-1', 'step_end', 400_000);

  await writeTaskControl(ctx.context, { taskID: ctx.taskID, control: 'stop' });

  const reads = await readMeterReads(ctx.context, ctx.run);
  const ended = await readEndedRuns(ctx.context, { taskID: ctx.taskID, limit: 1 });

  expect(ended).toHaveLength(1);

  expect(reads.at(-1)).toStrictEqual({
    sandbox: 'sandbox-1',
    reason: 'run_end',
    countMicros: 600_000,
  });
});

test('it ends the task run at the last count of a sandbox that the gateway no longer holds', async () => {
  const ctx = await setupTest();

  await ctx.writeRead('sandbox-1', 'run_start', 100_000);
  await ctx.writeRead('sandbox-1', 'step_end', 400_000);

  ctx.readSandboxMicros.mockResolvedValue({ kind: 'gone' });

  await writeTaskControl(ctx.context, { taskID: ctx.taskID, control: 'stop' });

  const reads = await readMeterReads(ctx.context, ctx.run);

  expect(reads.at(-1)).toStrictEqual({
    sandbox: 'sandbox-1',
    reason: 'run_end',
    countMicros: 400_000,
  });
});

test('it ends the task run with the end read of the runner tally in the same transaction', async () => {
  const ctx = await setupTest();

  await ctx.writeRead(ctx.taskID, 'step_end', 250_000);

  await writeTaskControl(ctx.context, { taskID: ctx.taskID, control: 'stop' });

  const reads = await readMeterReads(ctx.context, ctx.run);

  expect(ctx.readSandboxMicros.mock.calls).toStrictEqual([]);

  expect(reads.at(-1)).toStrictEqual({
    sandbox: ctx.taskID,
    reason: 'run_end',
    countMicros: 250_000,
  });
});

test('it commits nothing of a step that lost its lease while it waited for the end read', async () => {
  const ctx = await setupTest();

  const lost = new AbortController();

  await ctx.writeRead('sandbox-1', 'run_start', 100_000);

  ctx.readSandboxMicros.mockResolvedValue({ kind: 'unreachable' });

  const committing = Promise.allSettled([
    writeStepCommit(
      ctx.context,
      ctx.claim,
      { next: 'done', records: [], acknowledged: [], run: { activity: 'worked' } },
      lost.signal,
    ),
  ]);

  await waitForCondition(() => ctx.clock.countPending() === 1);

  lost.abort();

  const [settled] = await committing;
  const ended = await ctx.readKinds('task.run_ended');

  const reason = settled?.status === 'rejected' ? settled.reason : null;

  expect(settled?.status).toBe('rejected');
  expect(reason).toBeInstanceOf(LeaseLostError);
  expect(ended).toStrictEqual([]);
});

test('it reads the sandbox again at the end when an earlier attempt saved an end read, and the sandbox spent since', async () => {
  const ctx = await setupTest();

  await ctx.writeRead('sandbox-1', 'run_start', 100_000);
  await ctx.writeRead('sandbox-1', 'run_end', 250_000);

  ctx.readSandboxMicros.mockResolvedValue({ kind: 'ok', micros: 500_000 });

  await writeTaskControl(ctx.context, { taskID: ctx.taskID, control: 'stop' });

  const reads = await readMeterReads(ctx.context, ctx.run);
  const ended = await readEndedRuns(ctx.context, { taskID: ctx.taskID, limit: 1 });

  expect(ended).toHaveLength(1);

  expect(reads.at(-1)).toStrictEqual({
    sandbox: 'sandbox-1',
    reason: 'run_end',
    countMicros: 500_000,
  });
});

test('it reads every sandbox again at the retry when one sandbox did not answer and another spent since', async () => {
  const ctx = await setupTest();

  await ctx.writeRead('sandbox-a', 'run_start', 100_000);
  await ctx.writeRead('sandbox-b', 'run_start', 100_000);

  ctx.readSandboxMicros
    .mockResolvedValueOnce({ kind: 'ok', micros: 250_000 })
    .mockResolvedValueOnce({ kind: 'unreachable' })
    .mockResolvedValueOnce({ kind: 'ok', micros: 500_000 })
    .mockResolvedValueOnce({ kind: 'ok', micros: 300_000 });

  const stopping = writeTaskControl(ctx.context, { taskID: ctx.taskID, control: 'stop' });

  await waitForCondition(() => ctx.clock.countPending() === 1);

  ctx.clock.advance(5000);

  await stopping;

  const reads = await readMeterReads(ctx.context, ctx.run);
  const open = await readOpenRun(ctx.context.log.writer.db, ctx.taskID);
  const ended = await readEndedRuns(ctx.context, { taskID: ctx.taskID, limit: 1 });

  expect([open, ended.map((run) => run.runID)]).toStrictEqual([null, [ctx.run.runID]]);

  expect(ctx.readSandboxMicros.mock.calls).toStrictEqual([
    ['sandbox-a'],
    ['sandbox-b'],
    ['sandbox-a'],
    ['sandbox-b'],
  ]);

  expect(reads.filter((read) => read.reason === 'run_end')).toStrictEqual([
    { sandbox: 'sandbox-a', reason: 'run_end', countMicros: 250_000 },
    { sandbox: 'sandbox-a', reason: 'run_end', countMicros: 500_000 },
    { sandbox: 'sandbox-b', reason: 'run_end', countMicros: 300_000 },
  ]);
});
