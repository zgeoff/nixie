import { expect, test } from 'bun:test';
import {
  exemptTaskInTransaction,
  pauseNixieInTransaction,
  readRecords,
  resumeNixieInTransaction,
  withWriteTransaction,
  writeRecords,
} from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createConversationTask } from '../../conversation/create-conversation-task';
import { readRunRows } from '../../run/read-run-rows';
import { writeStepCommit } from '../../step/write-step-commit';
import { createTestClaim } from '../../test-utils/create-test-claim';
import { seedConversationStep } from '../../test-utils/seed-conversation-step';
import { seedDefinitionTask } from '../../test-utils/seed-definition-task';
import { seedTask } from '../../test-utils/seed-task';
import { startTestTasks } from '../../test-utils/start-test-tasks';
import { writeTestTriggerFire } from '../../test-utils/write-test-trigger-fire';
import type { RunStep, TasksTables } from '../../types';
import { taskRevivedCodec } from '../../utils/task-revived-codec';
import { createTask } from '../create-task';
import { runDueTimers } from '../run-due-timers';
import { runTaskStep } from '../run-task-step';
import { writeTaskControl } from '../write-task-control';
import type { ClaimTaskOptions } from './claim-task';
import { claimTask } from './claim-task';
import { writeInboxRecords } from './write-inbox-records';

async function setupTest() {
  const tasks = await startTestTasks();

  const db = tasks.writer.db.$extendTables<TasksTables>();
  const definitions = { snapshotHash: 'sha256:test' };
  const calls: string[] = [];

  const runStep: RunStep = (input) => {
    calls.push(input.stepKey);

    return Promise.resolve({
      next: 'wait',
      records: [],
      acknowledged: input.inbox.map((record) => record.sequence),
    });
  };

  return {
    ...tasks,
    db,
    definitions,
    calls,
    readTask: (taskID: string) =>
      db
        .selectFrom('tasks')
        .select(['state', 'read_cursor'])
        .where('task_id', '=', taskID)
        .executeTakeFirstOrThrow(),
    readRuns: (taskID: string) => readRunRows(tasks.writer.db, taskID),

    // a task that its holder lost, as after a server start, is ready again
    reviveTask: (taskID: string) =>
      writeRecords(tasks.context.log, [
        {
          kind: 'task.revived',
          definitions,
          thread: taskID,
          payload: taskRevivedCodec.encode({ taskID }),
        },
      ]),
    claimAndRun: async () => {
      const claim = await claimTask(tasks.context, { holder: 'runner-a', leaseMs: 60_000 });

      if (claim === null) {
        return false;
      }

      await runTaskStep(tasks.context, claim, {
        runStep,
        leaseMs: 60_000,
        logger: () => {},
        maxStepErrors: 3,
        retryDelayMs: 30_000,
        maxRetryDelayMs: 300_000,
      });

      return true;
    },
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

  const startedID = await seedTask(ctx.context, {
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

  await seedTask(ctx.context, {
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

    await seedTask(ctx.context, {
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

test('it opens a task run of origin trigger that pins the hash of the fire it claims', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-new',
  });

  ctx.definitionStore.add('hash-old', { policy: { limits: { turns: 3, dollars: 1, calls: {} } } });

  const sequence = await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-old',
    dedupeKey: 'key-1',
  });

  await ctx.claimAndRun();

  const [run] = await ctx.readRuns(taskID);

  expect(run?.opened).toStrictEqual({
    taskID,
    runID: expect.toBeString(),
    openedByStep: `${taskID}:1`,
    origin: { kind: 'trigger', sequence },
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-old',
    triggerKey: 'key-1',
    carriesRunID: null,
    briefID: expect.toBeString(),
    report: { mode: 'next_turn', target: 'conversation' },
    reportShape: null,
    limits: { turns: 3, dollars: 1, calls: {} },
  });
});

test('it takes the report mode of the definition and no target for none', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    policy: { report: 'none' },
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  await ctx.claimAndRun();

  const [run] = await ctx.readRuns(taskID);

  expect(run?.opened.report).toStrictEqual({ mode: 'none', target: null });
});

test('it runs the step of a claimed fire and leaves the task waiting with the run ended', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const sequence = await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  await ctx.claimAndRun();

  const [run] = await ctx.readRuns(taskID);

  expect(ctx.calls).toStrictEqual([`${taskID}:1`]);
  expect(run?.ended?.record.cause).toBe('no_report');

  const result = await ctx.readTask(taskID);

  expect(result).toStrictEqual({ state: 'waiting', read_cursor: sequence });
});

test('it keeps the run of a wakeable definition open between steps', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    policy: { wakeable: true },
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  await ctx.claimAndRun();

  const [run] = await ctx.readRuns(taskID);
  const task = await ctx.readTask(taskID);

  expect(run?.ended).toBeNull();
  expect(task.state).toBe('waiting');
});

test('it calls no runner for a claim that finds no unread input', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await ctx.reviveTask(taskID);

  const didClaim = await ctx.claimAndRun();

  expect(didClaim).toBeTrue();
  expect(ctx.calls).toStrictEqual([]);

  const result = await ctx.readRuns(taskID);
  const task = await ctx.readTask(taskID);

  expect(result).toStrictEqual([]);
  expect(task.state).toBe('waiting');
});

test('it opens no run for a message while the hash in force is null and leaves the message unread', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: null,
  });

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: ctx.context.definitions(),
      thread: taskID,
      erasable: { text: 'water them now' },
    },
  ]);

  await ctx.claimAndRun();

  expect(ctx.calls).toStrictEqual([]);

  const result = await ctx.readRuns(taskID);

  expect(result).toStrictEqual([]);

  const task = await ctx.readTask(taskID);

  expect(task.state).toBe('waiting');
  expect(task.read_cursor).toBeLessThan(message?.sequence ?? 0);
});

test('it opens a task run of a message while the hash in force is set', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: ctx.context.definitions(),
      thread: taskID,
      erasable: { text: 'water them now' },
    },
  ]);

  await ctx.claimAndRun();

  const [run] = await ctx.readRuns(taskID);

  expect(run?.opened).toMatchObject({
    origin: { kind: 'owner', sequence: message?.sequence },
    definitionHash: 'hash-1',
    triggerKey: null,
  });
});

test('it marks read a fire of a kind its codec does not know and opens no run for it', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const [fire] = await writeInboxRecords(ctx.context, [
    {
      kind: 'trigger.fired',
      definitions: ctx.context.definitions(),
      thread: taskID,
      payload: { definitionID: 'water-the-tomatoes', kind: 'webhook' },
    },
  ]);

  invariant(fire, 'the fire is written');

  await ctx.claimAndRun();

  expect(ctx.calls).toStrictEqual([]);

  const result2 = await ctx.readRuns(taskID);

  expect(result2).toStrictEqual([]);

  const result = await ctx.readTask(taskID);

  expect(result).toStrictEqual({
    state: 'waiting',
    read_cursor: fire.sequence,
  });
});

test('it ends an idle run and opens the run of a fire with another key in the same claim', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    policy: { wakeable: true },
  });

  await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-1',
    dedupeKey: 'key-1',
  });

  await ctx.claimAndRun();

  await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-1',
    dedupeKey: 'key-2',
  });

  await ctx.claimAndRun();

  const runs = await ctx.readRuns(taskID);

  expect(
    runs.map((run) => [run.opened.triggerKey, run.ended?.record.endedBy ?? null]),
  ).toStrictEqual([
    ['key-1', `claim:${taskID}:2`],
    ['key-2', null],
  ]);
});

test('it claims a fire whose version is not stored and opens no task run', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-missing' });

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(claim?.lease.workID).toBe(taskID);

  const runs = await ctx.readRuns(taskID);

  expect(runs).toStrictEqual([]);
});

test('it claims a definition task from the started pool and no other', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  const unstarted = await claimTask(ctx.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    tasks: 'unstarted',
  });

  const started = await claimTask(ctx.context, {
    holder: 'runner-a',
    leaseMs: 60_000,
    tasks: 'started',
  });

  expect(unstarted).toBeNull();
  expect(started?.lease.workID).toBe(taskID);
});
