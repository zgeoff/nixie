import { expect, test } from 'bun:test';
import { runProjectionRebuild } from '@heynixie/log';
import type { TasksTables } from './index';
import {
  claimTask,
  createConversationTask,
  createTask,
  runDueTimers,
  writeInboxRecords,
  writeStepCommit,
  writeStepError,
} from './index';
import { tasksProjections } from './tasks-projections';
import { startTestTasks } from './test-utils/start-test-tasks';

// two tasks: the conversation with a message in its inbox, whose step committed a wait on a timer
// due at 1,060,000, and a task whose step threw
async function setupTest() {
  const tasks = await startTestTasks();

  await createConversationTask(tasks.context);
  await createTask(tasks.context, 'check back in a minute');
  await writeInboxRecords(tasks.context, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  const first = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000 }).then(
    (claim) => claim ?? Promise.reject(new Error('the first setup claim found no task')),
  );
  const second = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000 }).then(
    (claim) => claim ?? Promise.reject(new Error('the second setup claim found no task')),
  );

  await writeStepCommit(tasks.context, first, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });
  await writeStepError(tasks.context, second, {
    error: new Error('boom'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
  });

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it lists the tasks projection before the timers projection that refers to it', () => {
  expect(tasksProjections.map((projection) => projection.table)).toStrictEqual(['tasks', 'timers']);
});

test('it rebuilds the tasks and timers tables equal to the live ones', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(60_000);
  await runDueTimers(ctx.context);

  const [liveTasks, liveTimers] = await Promise.all([
    ctx.db.selectFrom('tasks').selectAll().orderBy('task_id').execute(),
    ctx.db.selectFrom('timers').selectAll().orderBy('timer_id').execute(),
  ]);

  await runProjectionRebuild(ctx.context.log);

  const [rebuiltTasks, rebuiltTimers] = await Promise.all([
    ctx.db.selectFrom('tasks').selectAll().orderBy('task_id').execute(),
    ctx.db.selectFrom('timers').selectAll().orderBy('timer_id').execute(),
  ]);

  expect(rebuiltTasks).toStrictEqual(liveTasks);
  expect(rebuiltTimers).toStrictEqual(liveTimers);
  expect(liveTasks).toHaveLength(2);
  expect(liveTimers).toHaveLength(1);
});
