import { expect, test } from 'bun:test';
import {
  exemptTaskInTransaction,
  pauseNixieInTransaction,
  readRecords,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import type { ClaimTaskOptions } from './claim-task';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { createTask } from './create-task';
import { runDueTimers } from './run-due-timers';
import { createTestClaim } from './test-utils/create-test-claim';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedStartedTask } from './test-utils/seed-started-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepCommit } from './write-step-commit';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();

  const db = tasks.writer.db.$extendTables<TasksTables>();
  const definitions = { snapshotHash: 'sha256:test' };

  return {
    ...tasks,
    db,
    definitions,
    pauseNixie: () =>
      withWriteTransaction(tasks.writer, (tx) =>
        pauseNixieInTransaction(tx, tasks.context.log, {
          cause: 'owner',
          recoveryID: null,
          by: 'session-a',
          definitions,
        }),
      ),
    resumeNixie: () =>
      withWriteTransaction(tasks.writer, (tx) =>
        resumeNixieInTransaction(tx, tasks.context.log, { by: 'session-a', definitions }),
      ),
    exemptTask: (taskID: string) =>
      withWriteTransaction(tasks.writer, (tx) =>
        exemptTaskInTransaction(tx, tasks.context.log, { taskID, by: 'session-a', definitions }),
      ),
    readRecordCount: async () => {
      const records = await readRecords(tasks.context.log, { afterSequence: 0 });

      return records.length;
    },
  };
}

test('it moves a ready task to running and records the step it starts', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');
  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'started_step_key'])
    .executeTakeFirstOrThrow();

  const records = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(claim).toStrictEqual({
    lease: {
      kind: 'task',
      workID: taskID,
      holder: 'runner-a',
      generation: 1,
      epoch: ctx.writer.epoch,
      expiresAt: 1_060_000,
    },
    stepKey: `${taskID}:1`,
    wake: { hop: 0, cause: { kind: 'carried' } },
    startSequence: 2,
  });

  expect(task).toStrictEqual({ state: 'running', started_step_key: `${taskID}:1` });

  expect(records.map((read) => read.record.kind)).toStrictEqual([
    'task.created',
    'task.step_started',
  ]);
});

test('it never claims a waiting task', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(claim).toBeNull();
});

test('it never claims a running task whose lease still stands', async () => {
  const ctx = await setupTest();

  await createTask(ctx.context, 'tidy the inbox');
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  ctx.clock.advance(59_999);

  const claim = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  expect(claim).toBeNull();
});

test('it reclaims a running task whose lease expired, marking the lost step interrupted', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  ctx.clock.advance(60_000);

  const claim = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });
  const records = await readRecords(ctx.context.log, { afterSequence: 2 });

  expect(claim).toMatchObject({
    lease: { holder: 'runner-b', generation: 2 },
    stepKey: `${taskID}:1`,
  });

  expect(records.map((read) => read.record.kind)).toStrictEqual([
    'task.step_interrupted',
    'task.step_started',
  ]);
});

test('it waits out the retry delay of a failed step before claiming the task again', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');

  await ctx.db.updateTable('tasks').set({ claimable_at: 1_030_000 }).execute();

  const early = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  ctx.clock.advance(30_000);

  const due = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(early).toBeNull();
  expect(due?.lease.workID).toBe(taskID);
});

test('it pauses a running task whose pause waited on a step whose lease expired, and starts no step', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });
  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  ctx.clock.advance(60_000);

  const claim = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });
  const records = await readRecords(ctx.context.log, { afterSequence: 3 });
  const lease = await ctx.db.selectFrom('leases').select('holder').executeTakeFirstOrThrow();
  const task = await ctx.db.selectFrom('tasks').select('state').executeTakeFirstOrThrow();

  expect(claim).toBeNull();

  expect(records.map((read) => read.record.kind)).toStrictEqual([
    'task.step_interrupted',
    'task.paused',
  ]);

  expect(lease.holder).toBeNull();
  expect(task.state).toBe('paused');
});

test('it claims only a started task for the started tasks', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  await createTask(ctx.context, 'tidy the inbox');

  const startedID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await claimTask(ctx.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    tasks: 'started',
  });

  expect(claim?.lease.workID).toBe(startedID);
});

test('it claims only the task it names, though an older task is ready', async () => {
  const ctx = await setupTest();

  await createTask(ctx.context, 'tidy the inbox');

  const namedID = await createTask(ctx.context, 'water the ferns');

  const claim = await claimTask(ctx.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    taskID: namedID,
  });

  expect(claim?.lease.workID).toBe(namedID);
});

test('it never claims a started task for the unstarted tasks', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const claim = await claimTask(ctx.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    tasks: 'unstarted',
  });

  expect(claim).toBeNull();
});

test.each<[string, Pick<ClaimTaskOptions, 'tasks'>]>([
  ['started', { tasks: 'started' }],
  ['unstarted', { tasks: 'unstarted' }],
  ['every', {}],
])(
  'it claims no task while nixie is paused, for the %s tasks, and writes no record',
  async (_pool, pool) => {
    const ctx = await setupTest();
    const starter = await seedConversationStep(ctx.context);

    await createTask(ctx.context, 'tidy the inbox');

    await seedStartedTask(ctx.context, {
      starter: starter.claim,
      name: 'Tide tables',
      brief: 'Find the high tides for Saturday.',
    });

    await ctx.pauseNixie();

    const before = await ctx.readRecordCount();
    const claim = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000, ...pool });
    const after = await ctx.readRecordCount();

    expect(claim).toBeNull();
    expect(after).toBe(before);
  },
);

test('it claims no task by its ID while nixie is paused', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');

  await ctx.pauseNixie();

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  expect(claim).toBeNull();
});

test('it claims the step of an exempt task while nixie is paused, though a paused task comes first', async () => {
  const ctx = await setupTest();

  await createTask(ctx.context, 'tidy the inbox');

  const exemptID = await createTask(ctx.context, 'water the ferns');

  await ctx.pauseNixie();
  await ctx.exemptTask(exemptID);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(claim?.lease.workID).toBe(exemptID);
});

test('it refuses the claim of a task that an inbox record and a fired timer reached while nixie was paused, until nixie resumes', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  await ctx.pauseNixie();

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: ctx.definitions,
      thread: claim.lease.workID,
      erasable: { text: 'add the receipts too' },
    },
  ]);

  ctx.clock.advance(60_000);

  const fired = await runDueTimers(ctx.context);
  const refused = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  await ctx.resumeNixie();

  const taken = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  expect(fired).toBe(1);
  expect(refused).toBeNull();
  expect(taken?.lease.workID).toBe(claim.lease.workID);
});

test('it leaves a task row and its lease as they were through a pause, an exemption and a resume', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  const readRows = async () => {
    const task = await ctx.db.selectFrom('tasks').selectAll().execute();
    const leases = await ctx.db.selectFrom('leases').selectAll().execute();

    return { task, leases };
  };

  const before = await readRows();

  await ctx.pauseNixie();
  await ctx.exemptTask(claim.lease.workID);

  const paused = await readRows();

  await ctx.resumeNixie();

  const after = await readRows();

  expect(paused).toStrictEqual(before);
  expect(after).toStrictEqual(before);
});
