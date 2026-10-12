import { expect, test } from 'bun:test';
import { runProjectionRebuild } from '@heynixie/log';
import type { TasksTables } from './index';
import { runDueTimers, writeInboxRecords, writeStepCommit, writeStepError } from './index';
import { tasksProjections } from './tasks-projections';
import { createTestClaim } from './test-utils/create-test-claim';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it lists the tasks projection before the timers projection that refers to it', () => {
  expect(tasksProjections.map((projection) => projection.table)).toStrictEqual(['tasks', 'timers']);
});

test('it rebuilds the tasks table equal to the live one after a commit and a message', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });
  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
    },
  ]);

  const live = await ctx.db.selectFrom('tasks').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('tasks').selectAll().execute();

  expect(live).toHaveLength(1);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds the tasks table equal to the live one after a step error', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
  });

  const live = await ctx.db.selectFrom('tasks').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('tasks').selectAll().execute();

  expect(live).toHaveLength(1);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds the timers table equal to the live one after a timer fires', async () => {
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

  const live = await ctx.db.selectFrom('timers').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('timers').selectAll().execute();

  expect(live).toHaveLength(1);
  expect(rebuilt).toStrictEqual(live);
});
