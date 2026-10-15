import { expect, mock, onTestFinished, test } from 'bun:test';
import { runRecovery } from './run-recovery';
import { setFaultPointHandler } from './set-fault-point-handler';
import { createTestClaim } from './test-utils/create-test-claim';
import { startNextTestWriter } from './test-utils/start-next-test-writer';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeStepCommit } from './write-step-commit';

function setupTest() {
  return startTestTasks();
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

test('it frees a lease claimed under the older epoch', async () => {
  const ctx = await setupTest();

  await createTestClaim(ctx.context, 'tidy the inbox');

  const before = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('leases')
    .select('holder')
    .executeTakeFirstOrThrow();

  const next = await startNextTestWriter(ctx);

  await runRecovery(next.context, {
    writeUnknownOutcomes: mock(() => Promise.resolve()),
    sandboxes: { removeStaleSandboxes: mock(() => Promise.resolve()) },
  });

  const after = await next.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('leases')
    .select('holder')
    .executeTakeFirstOrThrow();

  expect(before.holder).toBe('runner-a');
  expect(after.holder).toBeNull();
});

test('it returns a task running under the older epoch to ready', async () => {
  const ctx = await setupTest();

  await createTestClaim(ctx.context, 'tidy the inbox');

  const before = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .executeTakeFirstOrThrow();

  const next = await startNextTestWriter(ctx);

  await runRecovery(next.context, {
    writeUnknownOutcomes: mock(() => Promise.resolve()),
    sandboxes: { removeStaleSandboxes: mock(() => Promise.resolve()) },
  });

  const after = await next.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['state', 'started_step_key'])
    .executeTakeFirstOrThrow();

  expect(before.state).toBe('running');
  expect(after).toStrictEqual({ state: 'ready', started_step_key: null });
});

test('it records the step that started without a commit as interrupted', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  const before = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select(['kind', 'thread'])
    .where('kind', 'in', ['task.lease_expired', 'task.step_interrupted'])
    .execute();

  const next = await startNextTestWriter(ctx);

  await runRecovery(next.context, {
    writeUnknownOutcomes: mock(() => Promise.resolve()),
    sandboxes: { removeStaleSandboxes: mock(() => Promise.resolve()) },
  });

  const records = await next.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select(['kind', 'thread'])
    .where('kind', 'in', ['task.lease_expired', 'task.step_interrupted'])
    .execute();

  expect(before).toStrictEqual([]);

  expect(records).toStrictEqual([
    { kind: 'task.lease_expired', thread: claim.lease.workID },
    { kind: 'task.step_interrupted', thread: claim.lease.workID },
  ]);
});

test('it fires the timers that fell due while nixie was down', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  const before = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('timers')
    .select(['due_at', 'fired_at'])
    .executeTakeFirstOrThrow();

  const next = await startNextTestWriter(ctx);

  next.clock.advance(120_000);

  await runRecovery(next.context, {
    writeUnknownOutcomes: mock(() => Promise.resolve()),
    sandboxes: { removeStaleSandboxes: mock(() => Promise.resolve()) },
  });

  const timer = await next.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('timers')
    .select(['due_at', 'fired_at'])
    .executeTakeFirstOrThrow();

  expect(before).toStrictEqual({ due_at: 1_060_000, fired_at: null });
  expect(timer).toStrictEqual({ due_at: 1_060_000, fired_at: 1_120_000 });
});

test('it wakes a task whose timer fell due while nixie was down', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  const before = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .executeTakeFirstOrThrow();

  const next = await startNextTestWriter(ctx);

  next.clock.advance(120_000);

  await runRecovery(next.context, {
    writeUnknownOutcomes: mock(() => Promise.resolve()),
    sandboxes: { removeStaleSandboxes: mock(() => Promise.resolve()) },
  });

  const task = await next.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .executeTakeFirstOrThrow();

  expect(before.state).toBe('waiting');
  expect(task.state).toBe('ready');
});

test('it writes nothing more when it runs again', async () => {
  const ctx = await setupTest();

  await createTestClaim(ctx.context, 'tidy the inbox');

  const next = await startNextTestWriter(ctx);

  const dependencies = {
    writeUnknownOutcomes: mock(() => Promise.resolve()),
    sandboxes: { removeStaleSandboxes: mock(() => Promise.resolve()) },
  };

  await runRecovery(next.context, dependencies);

  const db = next.writer.db.$extendTables<TasksTables>();

  const before = await db.selectFrom('records').select('sequence').execute();

  await runRecovery(next.context, dependencies);

  const after = await db.selectFrom('records').select('sequence').execute();

  expect(after).toStrictEqual(before);
});
