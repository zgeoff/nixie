import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { runDueTimers } from './run-due-timers';
import { setFaultPointHandler } from './set-fault-point-handler';
import { createTestClaim } from './test-utils/create-test-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { FaultPointID, TasksTables } from './types';
import { writeStepCommit } from './write-step-commit';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it fires a due timer into its task inbox and wakes the task', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

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
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  ctx.clock.advance(59_999);

  const fired = await runDueTimers(ctx.context);

  expect(fired).toBe(0);
});

test('it records both the due time and the fire time of a timer that fires late', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  ctx.clock.advance(3_600_000);

  await runDueTimers(ctx.context);

  const entries = await readRecords(ctx.context.log, { afterSequence: 3 });
  const timer = await ctx.db.selectFrom('timers').selectAll().executeTakeFirstOrThrow();

  expect(entries.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'timer.fired',
      thread: claim.lease.workID,
      payload: {
        timerID: timer.timer_id,
        taskID: claim.lease.workID,
        dueAt: 1_060_000,
        firedAt: 4_600_000,
      },
    },
  ]);

  expect(timer).toMatchObject({ fired_at: 4_600_000, fired_sequence: 4 });
});

test('it fires each timer once', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  ctx.clock.advance(60_000);

  await runDueTimers(ctx.context);

  const fired = await runDueTimers(ctx.context);

  expect(fired).toBe(0);
});

test('it reaches timer.fire.before, then inbox.write.after once the fire commits', async () => {
  const ctx = await setupTest();

  const reached: FaultPointID[] = [];

  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

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
