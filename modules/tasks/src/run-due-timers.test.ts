import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { claimTask } from './claim-task';
import { createTask } from './create-task';
import { runDueTimers } from './run-due-timers';
import { setFaultPointHandler } from './set-fault-point-handler';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { FaultPointID, TasksTables } from './types';
import { writeStepCommit } from './write-step-commit';

// a task that committed a step waiting on one timer, due at 1,060,000
async function setupTest() {
  const tasks = await startTestTasks();
  const db = tasks.writer.db.$extendTables<TasksTables>();
  const taskID = await createTask(tasks.context, 'check back in a minute');
  const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('the setup claim found no task');
  }
  await writeStepCommit(tasks.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  return { ...tasks, db, taskID };
}

test('it fires a due timer into its task inbox and wakes the task', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(60_000);

  const fired = await runDueTimers(ctx.context);

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'last_inbox_sequence'])
    .executeTakeFirstOrThrow();

  expect(fired).toBe(1);
  expect(task).toStrictEqual({ state: 'ready', last_inbox_sequence: 4 });
});

test('it leaves a timer that is not yet due', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(59_999);

  const fired = await runDueTimers(ctx.context);

  expect(fired).toBe(0);
});

test('it records both the due time and the fire time of a timer that fires late', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(3_600_000);
  await runDueTimers(ctx.context);

  const entries = await readRecords(ctx.context.log, { afterSequence: 3 });
  const timer = await ctx.db.selectFrom('timers').selectAll().executeTakeFirstOrThrow();

  expect(entries.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'timer.fired',
      thread: ctx.taskID,
      payload: {
        timerID: timer.timer_id,
        taskID: ctx.taskID,
        dueAt: 1_060_000,
        firedAt: 4_600_000,
      },
    },
  ]);
  expect(timer).toMatchObject({ fired_at: 4_600_000, fired_sequence: 4 });
});

test('it fires each timer once', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(60_000);
  await runDueTimers(ctx.context);

  const fired = await runDueTimers(ctx.context);

  expect(fired).toBe(0);
});

test('it reaches timer.fire.before, then inbox.write.after once the fire commits', async () => {
  const ctx = await setupTest();
  const reached: FaultPointID[] = [];

  setFaultPointHandler((id) => {
    reached.push(id);
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });
  ctx.clock.advance(60_000);

  await runDueTimers(ctx.context);

  expect(reached).toStrictEqual(['timer.fire.before', 'inbox.write.after']);
});
