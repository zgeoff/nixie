import { expect, mock, onTestFinished, test } from 'bun:test';
import { startWriter } from '@heynixie/log';
import { claimTask } from './claim-task';
import { createTask } from './create-task';
import { runRecovery } from './run-recovery';
import { setFaultPointHandler } from './set-fault-point-handler';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksContext, TasksTables } from './types';
import { writeStepCommit } from './write-step-commit';

// A process that ran one task's step and left another task waiting on a timer, then died. The
// restarted writer raised the epoch, as a real restart does before recovery runs.
async function setupTest() {
  const tasks = await startTestTasks();
  const sleeper = await createTask(tasks.context, 'check back in a minute');
  const sleeperClaim = await claimTask(tasks.context, { holder: 'old', leaseMs: 60_000 }).then(
    (claim) => claim ?? Promise.reject(new Error('the setup claim found no task')),
  );

  await writeStepCommit(tasks.context, sleeperClaim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  const runningTask = await createTask(tasks.context, 'tidy the inbox');

  await claimTask(tasks.context, { holder: 'old', leaseMs: 60_000 });
  await tasks.writer.stop();

  const writer = await startWriter({ dataDir: tasks.dataDir });

  onTestFinished(() => writer.stop());

  return {
    ...tasks,
    writer,
    context: { ...tasks.context, log: { ...tasks.context.log, writer } } satisfies TasksContext,
    db: writer.db.$extendTables<TasksTables>(),
    sleeper,
    runningTask,
  };
}

test('it runs the 5 recovery steps in order, with steps 3 and 5 through the dependencies', async () => {
  const ctx = await setupTest();
  const calls: string[] = [];

  setFaultPointHandler((id) => {
    calls.push(id);
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await runRecovery(ctx.context, {
    writeUnknownOutcomes: () => {
      calls.push('unknown outcomes');

      return Promise.resolve();
    },
    sandboxes: {
      removeStaleSandboxes: () => {
        calls.push('stale sandboxes');

        return Promise.resolve();
      },
    },
  });

  expect(calls).toStrictEqual([
    'recovery.step.1',
    'recovery.step.2',
    'unknown outcomes',
    'recovery.step.3',
    'recovery.step.4',
    'stale sandboxes',
    'recovery.step.5',
  ]);
});

test('it frees every lease from the older epoch and returns the running task to ready', async () => {
  const ctx = await setupTest();

  await runRecovery(ctx.context, {
    writeUnknownOutcomes: mock(async () => {}),
    sandboxes: { removeStaleSandboxes: mock(async () => {}) },
  });

  const leases = await ctx.db.selectFrom('leases').select(['work_id', 'holder']).execute();
  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'started_step_key'])
    .where('task_id', '=', ctx.runningTask)
    .executeTakeFirstOrThrow();

  expect(leases).toIncludeSameMembers([
    { work_id: ctx.sleeper, holder: null },
    { work_id: ctx.runningTask, holder: null },
  ]);
  expect(task).toStrictEqual({ state: 'ready', started_step_key: null });
});

test('it records the step that started without a commit as interrupted', async () => {
  const ctx = await setupTest();

  await runRecovery(ctx.context, {
    writeUnknownOutcomes: mock(async () => {}),
    sandboxes: { removeStaleSandboxes: mock(async () => {}) },
  });

  const records = await ctx.db
    .selectFrom('records')
    .select(['kind', 'thread'])
    .where('kind', 'in', ['task.lease_expired', 'task.step_interrupted'])
    .execute();

  expect(records).toStrictEqual([
    { kind: 'task.lease_expired', thread: ctx.runningTask },
    { kind: 'task.step_interrupted', thread: ctx.runningTask },
  ]);
});

test('it fires the timers that fell due while nixie was down', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(120_000);

  await runRecovery(ctx.context, {
    writeUnknownOutcomes: mock(async () => {}),
    sandboxes: { removeStaleSandboxes: mock(async () => {}) },
  });

  const timer = await ctx.db.selectFrom('timers').selectAll().executeTakeFirstOrThrow();
  const sleeper = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', ctx.sleeper)
    .executeTakeFirstOrThrow();

  expect(timer).toMatchObject({ due_at: 1_060_000, fired_at: 1_120_000 });
  expect(sleeper.state).toBe('ready');
});

test('it writes nothing more when it runs again', async () => {
  const ctx = await setupTest();
  const dependencies = {
    writeUnknownOutcomes: mock(async () => {}),
    sandboxes: { removeStaleSandboxes: mock(async () => {}) },
  };

  ctx.clock.advance(120_000);
  await runRecovery(ctx.context, dependencies);

  const before = await ctx.db.selectFrom('records').select('sequence').execute();

  await runRecovery(ctx.context, dependencies);

  const after = await ctx.db.selectFrom('records').select('sequence').execute();

  expect(after).toHaveLength(before.length);
});
