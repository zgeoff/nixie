import { expect, test } from 'bun:test';
import type { RecordKind } from '@heynixie/log';
import {
  exemptTaskInTransaction,
  pauseNixieInTransaction,
  readRecords,
  withWriteTransaction,
} from '@heynixie/log';
import { buildLogSeeder } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';
import { writeTaskControl } from '../task/write-task-control';
import { buildTaskSeeder } from '../test-utils/build-task-seeder';
import { createTestTaskInState } from '../test-utils/create-test-task-in-state';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readTaskGate } from './read-task-gate';

async function setupTest() {
  const tasks = await startTestTasks();

  const definitions = tasks.context.definitions();

  const starter = await seedConversationStep(tasks.context);

  return {
    ...tasks,
    started: { starter: starter.claim, name: 'Tide tables', brief: 'Find the tides.' },
    seed: { ...buildTaskSeeder(tasks), ...buildLogSeeder(tasks.context) },
    readGate: (taskID: string) =>
      withWriteTransaction(tasks.writer, (tx) => readTaskGate(tx, taskID)),
    pauseNixie: () =>
      withWriteTransaction(tasks.writer, (tx) =>
        pauseNixieInTransaction(tx, tasks.context.log, {
          cause: 'owner',
          recoveryID: null,
          by: 'session-a',
          definitions,
        }),
      ),
    exempt: (taskID: string) =>
      withWriteTransaction(tasks.writer, (tx) =>
        exemptTaskInTransaction(tx, tasks.context.log, { taskID, by: 'session-a', definitions }),
      ),
    readNewestRecordTime: async (kind: RecordKind, thread: string | null) => {
      const records = await readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: [kind],
        ...(thread === null ? {} : { thread }),
      });

      const newest = records.at(-1);

      invariant(newest, 'the record was written');

      return newest.record.recordedAt.getTime();
    },
  };
}

test('it reads open for a ready task', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'ready');
  const gate = await ctx.readGate(task.taskID);

  expect(gate).toStrictEqual({ open: true });
});

test('it reads open for a task with no row', async () => {
  const ctx = await setupTest();
  const gate = await ctx.readGate('no-such-task');

  expect(gate).toStrictEqual({ open: true });
});

test('it reads task for a paused task, since its task.paused record', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'ready');

  await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'pause' });

  const gate = await ctx.readGate(task.taskID);
  const since = await ctx.readNewestRecordTime('task.paused', task.taskID);

  expect(gate).toStrictEqual({ open: false, reason: 'task', since });
});

test('it reads open for a task whose pause was asked for but not yet written', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'pause_requested');
  const gate = await ctx.readGate(task.taskID);

  expect(gate).toStrictEqual({ open: true });
});

test.each([
  ['done', 'doneTask', 'task.step_committed'],
  ['stopped', 'stoppedTask', 'task.stopped'],
  ['failed', 'failedTask', 'task.step_errored'],
  ['closed', 'closedTask', 'task.closed'],
] as const)(
  'it reads ended for a %s task, since the record that ended it',
  async (_state, seeder, kind) => {
    const ctx = await setupTest();
    const taskID = await ctx.seed[seeder](ctx.started);
    const gate = await ctx.readGate(taskID);
    const since = await ctx.readNewestRecordTime(kind, taskID);

    expect(gate).toStrictEqual({ open: false, reason: 'ended', since });
  },
);

test('it reads limit for a task at its limit, ahead of its own pause, since task.limit_reached', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.seed.pausedTask({
    starter: ctx.started.starter,
    limits: { turns: 1, dollars: 2 },
  });

  const gate = await ctx.readGate(taskID);
  const since = await ctx.readNewestRecordTime('task.limit_reached', taskID);

  expect(gate).toStrictEqual({ open: false, reason: 'limit', since });
});

test('it reads nixie for a task that nixie pausing holds, since the pause record', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'ready');

  await ctx.pauseNixie();

  const gate = await ctx.readGate(task.taskID);
  const since = await ctx.readNewestRecordTime('nixie.paused', null);

  expect(gate).toStrictEqual({ open: false, reason: 'nixie', since });
});

test('it reads open for a task that its owner resumed while nixie is paused', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'ready');

  await ctx.pauseNixie();
  await ctx.exempt(task.taskID);

  const gate = await ctx.readGate(task.taskID);

  expect(gate).toStrictEqual({ open: true });
});

test('it reads spend for a standing stop, though the task is exempt from the pause, since the stop record', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'ready');

  await ctx.pauseNixie();
  await ctx.exempt(task.taskID);
  await ctx.seed.spendStop();

  const gate = await ctx.readGate(task.taskID);
  const since = await ctx.readNewestRecordTime('spend.stop_tripped', null);

  expect(gate).toStrictEqual({ open: false, reason: 'spend', since });
});

test('it reads spend ahead of nixie when both hold', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'ready');

  await ctx.pauseNixie();
  await ctx.seed.spendStop();

  const gate = await ctx.readGate(task.taskID);

  expect(gate).toMatchObject({ open: false, reason: 'spend' });
});

test('it reads ended ahead of spend, nixie and limit', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.stoppedTask(ctx.started);

  await ctx.pauseNixie();
  await ctx.seed.spendStop();

  const gate = await ctx.readGate(taskID);

  expect(gate).toMatchObject({ open: false, reason: 'ended' });
});
