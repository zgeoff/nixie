import { expect, test } from 'bun:test';
import {
  pauseNixieInTransaction,
  readRecords,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { claimTask } from './claim-task';
import { createTask } from './create-task';
import { readInbox } from './read-inbox';
import { runDueTimers } from './run-due-timers';
import { createTestClaim } from './test-utils/create-test-claim';
import { createTestTaskInState } from './test-utils/create-test-task-in-state';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedHeldTask } from './test-utils/seed-held-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepCommit } from './write-step-commit';
import { writeTaskControl } from './write-task-control';
import { writeTaskResume } from './write-task-resume';

async function setupTest() {
  const tasks = await startTestTasks();

  const definitions = { snapshotHash: 'sha256:test' };

  return {
    ...tasks,
    db: tasks.writer.db.$extendTables<TasksTables>(),
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
    readControlRecords: () =>
      readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['task.paused', 'task.resumed', 'nixie.task_exempted'],
      }),
    claim: (holder: string) => claimTask(tasks.context, { holder, leaseMs: 60_000 }),
  };
}

test('it runs each task as its records say after nixie resumes, and keeps a task you paused paused', async () => {
  const ctx = await setupTest();
  const waiting = await createTestTaskInState(ctx.context, 'waiting');
  const ready = await createTestTaskInState(ctx.context, 'ready');
  const paused = await createTestTaskInState(ctx.context, 'paused');

  await ctx.pauseNixie();

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: ctx.definitions,
      thread: waiting.taskID,
      erasable: { text: 'add the receipts too' },
    },
  ]);

  await ctx.resumeNixie();

  const first = await ctx.claim('runner-b');
  const second = await ctx.claim('runner-b');
  const third = await ctx.claim('runner-b');

  const state = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', paused.taskID)
    .executeTakeFirstOrThrow();

  const claimed = [first?.lease.workID, second?.lease.workID];

  expect(claimed).toIncludeSameMembers([ready.taskID, waiting.taskID]);
  expect(third).toBeNull();
  expect(state.state).toBe('paused');
});

test('it exempts a ready task with its resume while nixie is paused, and writes no task record', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');

  await createTask(ctx.context, 'water the ferns');

  await ctx.pauseNixie();

  const outcome = await writeTaskResume(ctx.context, { taskID, by: 'host' });
  const records = await ctx.readControlRecords();
  const claim = await ctx.claim('runner-a');
  const other = await ctx.claim('runner-a');

  expect(outcome).toStrictEqual({
    status: 'controlled',
    state: 'ready',
    isPauseRequested: false,
    sequence: expect.any(Number),
  });

  expect(records.map((read) => read.record.kind)).toStrictEqual(['nixie.task_exempted']);
  expect(records[0]?.record.payload).toStrictEqual({ taskID, by: 'host' });
  expect(claim?.lease.workID).toBe(taskID);
  expect(other).toBeNull();
});

test('it pauses an exempt task as built, keeps its exemption, and resumes it with a task record only', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');

  await ctx.pauseNixie();

  await writeTaskResume(ctx.context, { taskID, by: 'host' });
  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  const pausedClaim = await ctx.claim('runner-a');
  const resumed = await writeTaskResume(ctx.context, { taskID, by: 'host' });
  const records = await ctx.readControlRecords();
  const claim = await ctx.claim('runner-a');

  expect(pausedClaim).toBeNull();
  expect(resumed.status).toBe('controlled');

  expect(records.map((read) => read.record.kind)).toStrictEqual([
    'nixie.task_exempted',
    'task.paused',
    'task.resumed',
  ]);

  expect(claim?.lease.workID).toBe(taskID);
});

test('it resumes a task paused on its own and exempts it in one transaction while nixie is paused', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'paused');

  const taskID = task.taskID;

  await ctx.pauseNixie();

  const outcome = await writeTaskResume(ctx.context, { taskID, by: 'host' });
  const records = await ctx.readControlRecords();
  const claim = await ctx.claim('runner-a');

  expect(outcome).toStrictEqual({
    status: 'controlled',
    state: 'ready',
    isPauseRequested: false,
    sequence: expect.any(Number),
  });

  expect(records.map((read) => read.record.kind)).toStrictEqual([
    'task.paused',
    'task.resumed',
    'nixie.task_exempted',
  ]);

  expect(records[2]?.record.sequence).toBe((records[1]?.record.sequence ?? 0) + 1);
  expect(claim?.lease.workID).toBe(taskID);
});

test('it refuses the resume of a limit-held task while nixie is paused, and writes no record', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedHeldTask(ctx.context, {
    starter: starter.claim,
    limits: { turns: 3, dollars: 1 },
  });

  await ctx.pauseNixie();

  const before = await ctx.readControlRecords();
  const outcome = await writeTaskResume(ctx.context, { taskID, by: 'host' });
  const after = await ctx.readControlRecords();

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'at_limit', state: 'paused', isPauseRequested: false },
  });

  expect(after).toStrictEqual(before);
});

test.each(['done', 'stopped'] as const)(
  'it exempts a %s task with its resume while nixie is paused, and leaves its state as it was',
  async (state) => {
    const ctx = await setupTest();
    const task = await createTestTaskInState(ctx.context, state);

    const taskID = task.taskID;

    await ctx.pauseNixie();

    const outcome = await writeTaskResume(ctx.context, { taskID, by: 'host' });
    const records = await ctx.readControlRecords();

    expect(outcome).toStrictEqual({
      status: 'controlled',
      state,
      isPauseRequested: false,
      sequence: expect.any(Number),
    });

    expect(records.map((read) => read.record.kind)).toStrictEqual(['nixie.task_exempted']);
  },
);

test('it refuses the resume of a ready task as built while nixie is not paused, and writes nothing', async () => {
  const ctx = await setupTest();
  const taskID = await createTask(ctx.context, 'tidy the inbox');
  const outcome = await writeTaskResume(ctx.context, { taskID, by: 'host' });
  const records = await ctx.readControlRecords();

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'not_allowed', state: 'ready', isPauseRequested: false },
  });

  expect(records).toStrictEqual([]);
});

test('it refuses the resume of an unknown task while nixie is paused, and writes nothing', async () => {
  const ctx = await setupTest();

  await ctx.pauseNixie();

  const outcome = await writeTaskResume(ctx.context, { taskID: 'k3x9m2p7qa', by: 'host' });
  const records = await ctx.readControlRecords();

  expect(outcome).toStrictEqual({ status: 'refused', refusal: { reason: 'unknown_task' } });
  expect(records).toStrictEqual([]);
});

test('it leaves a timer and an inbox record that wait on a task as they were through an exemption and a resume of nixie', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  const taskID = claim.lease.workID;

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
      thread: taskID,
      erasable: { text: 'add the receipts too' },
    },
  ]);

  ctx.clock.advance(60_000);

  await runDueTimers(ctx.context);

  const readRows = async () => ({
    timers: await ctx.db.selectFrom('timers').selectAll().execute(),
    inbox: await ctx.db
      .selectFrom('records')
      .selectAll()
      .where('kind', '=', 'owner_message')
      .execute(),
  });

  const before = await readRows();

  await writeTaskResume(ctx.context, { taskID, by: 'host' });

  const exempt = await readRows();

  await ctx.resumeNixie();

  const after = await readRows();
  const taken = await ctx.claim('runner-b');
  const inbox = await readInbox(ctx.context, taskID);

  expect(exempt).toStrictEqual(before);
  expect(after).toStrictEqual(before);
  expect(taken?.lease.workID).toBe(taskID);
  expect(inbox.map((record) => record.kind)).toIncludeSameMembers(['owner_message', 'timer.fired']);
});

test('it resumes a running task that holds a pause request and exempts it while nixie is paused', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'pause_requested');

  const taskID = task.taskID;

  await ctx.pauseNixie();

  const outcome = await writeTaskResume(ctx.context, { taskID, by: 'host' });
  const records = await ctx.readControlRecords();

  const row = await ctx.db
    .selectFrom('tasks')
    .select('pause_requested')
    .where('task_id', '=', taskID)
    .executeTakeFirstOrThrow();

  expect(outcome).toStrictEqual({
    status: 'controlled',
    state: 'running',
    isPauseRequested: false,
    sequence: expect.any(Number),
  });

  expect(records.map((read) => read.record.kind)).toStrictEqual([
    'task.resumed',
    'nixie.task_exempted',
  ]);

  expect(row.pause_requested).toBe(0);
});
