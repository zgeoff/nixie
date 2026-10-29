import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { createSystemTask } from './create-system-task';
import { LeaseLostError } from './lease-lost-error';
import { runDueTimers } from './run-due-timers';
import type { TestTaskState } from './test-utils/create-test-task-in-state';
import { createTestTaskInState } from './test-utils/create-test-task-in-state';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeTestTaskMessage } from './test-utils/write-test-task-message';
import type { TaskControl, TaskState, TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepCommit } from './write-step-commit';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test.each<[TestTaskState, TaskControl, TaskState, boolean]>([
  ['ready', 'pause', 'paused', false],
  ['ready', 'stop', 'stopped', false],
  ['ready', 'close', 'closed', false],
  ['running', 'pause', 'running', true],
  ['running', 'stop', 'stopped', false],
  ['running', 'close', 'closed', false],
  ['running', 'interrupt', 'running', false],
  ['pause_requested', 'resume', 'running', false],
  ['pause_requested', 'stop', 'stopped', false],
  ['pause_requested', 'close', 'closed', false],
  ['pause_requested', 'interrupt', 'running', true],
  ['waiting', 'pause', 'paused', false],
  ['waiting', 'stop', 'stopped', false],
  ['waiting', 'close', 'closed', false],
  ['paused', 'resume', 'ready', false],
  ['paused', 'stop', 'stopped', false],
  ['paused', 'close', 'closed', false],
  ['stopped', 'restart', 'ready', false],
  ['stopped', 'close', 'closed', false],
  ['failed', 'restart', 'ready', false],
  ['failed', 'close', 'closed', false],
  ['done', 'close', 'closed', false],
])('it moves a %s task on %s to %s', async (from, control, to, isPauseRequested) => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, from);
  const outcome = await writeTaskControl(ctx.context, { taskID: task.taskID, control });

  expect(outcome).toStrictEqual({
    status: 'controlled',
    state: to,
    isPauseRequested,
    sequence: expect.toBeNumber(),
  });
});

test.each<[TestTaskState, TaskControl, TaskState, boolean]>([
  ['ready', 'resume', 'ready', false],
  ['ready', 'restart', 'ready', false],
  ['ready', 'interrupt', 'ready', false],
  ['running', 'resume', 'running', false],
  ['running', 'restart', 'running', false],
  ['pause_requested', 'pause', 'running', true],
  ['pause_requested', 'restart', 'running', true],
  ['waiting', 'resume', 'waiting', false],
  ['waiting', 'restart', 'waiting', false],
  ['waiting', 'interrupt', 'waiting', false],
  ['paused', 'pause', 'paused', false],
  ['paused', 'restart', 'paused', false],
  ['paused', 'interrupt', 'paused', false],
  ['stopped', 'pause', 'stopped', false],
  ['stopped', 'resume', 'stopped', false],
  ['stopped', 'stop', 'stopped', false],
  ['stopped', 'interrupt', 'stopped', false],
  ['failed', 'pause', 'failed', false],
  ['failed', 'resume', 'failed', false],
  ['failed', 'stop', 'failed', false],
  ['failed', 'interrupt', 'failed', false],
  ['done', 'pause', 'done', false],
  ['done', 'resume', 'done', false],
  ['done', 'stop', 'done', false],
  ['done', 'restart', 'done', false],
  ['done', 'interrupt', 'done', false],
  ['closed', 'pause', 'closed', false],
  ['closed', 'resume', 'closed', false],
  ['closed', 'stop', 'closed', false],
  ['closed', 'restart', 'closed', false],
  ['closed', 'close', 'closed', false],
  ['closed', 'interrupt', 'closed', false],
])('it refuses a %s task the %s control', async (from, control, state, isPauseRequested) => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, from);
  const outcome = await writeTaskControl(ctx.context, { taskID: task.taskID, control });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'not_allowed', state, isPauseRequested },
  });
});

test('it writes no record for a refused control', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'done');
  const before = await readRecords(ctx.context.log, { afterSequence: 0 });

  await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'pause' });

  const after = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(after).toHaveLength(before.length);
});

test('it refuses to close the conversation', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const outcome = await writeTaskControl(ctx.context, {
    taskID: 'conversation',
    control: 'close',
  });

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'conversation_never_closes' },
  });
});

test('it stops the conversation, which a restart returns to waiting', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);
  await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'stop' });

  const outcome = await writeTaskControl(ctx.context, {
    taskID: 'conversation',
    control: 'restart',
  });

  expect(outcome).toMatchObject({ status: 'controlled', state: 'waiting' });
});

test('it refuses a control of a task that does not exist', async () => {
  const ctx = await setupTest();
  const outcome = await writeTaskControl(ctx.context, { taskID: 'q4w8e2r6ty', control: 'stop' });

  expect(outcome).toStrictEqual({ status: 'refused', refusal: { reason: 'unknown_task' } });
});

test('it records the stop of a running task with the step it ends and its pending timers', async () => {
  const ctx = await setupTest();
  const waiting = await createTestTaskInState(ctx.context, 'ready');
  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  await writeStepCommit(ctx.context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 2_000_000 }],
  });

  const running = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(running);

  const timer = await ctx.db.selectFrom('timers').select('timer_id').executeTakeFirstOrThrow();
  const outcome = await writeTaskControl(ctx.context, { taskID: waiting.taskID, control: 'stop' });

  invariant(outcome.status === 'controlled');

  const [record] = await readRecords(ctx.context.log, { afterSequence: outcome.sequence - 1 });

  expect(record?.record).toMatchObject({
    kind: 'task.stopped',
    thread: waiting.taskID,
    payload: {
      taskID: waiting.taskID,
      stepKey: running.stepKey,
      timerIDs: [timer.timer_id],
      resumeState: 'ready',
    },
  });
});

test('it frees the lease of the step a stop ends, so the step commits nothing', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'running');

  invariant(task.claim);

  await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'stop' });

  const commit = await writeStepCommit(ctx.context, task.claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
  }).then(
    () => null,
    (error: unknown) => error,
  );

  const row = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'committed_steps', 'started_step_key'])
    .where('task_id', '=', task.taskID)
    .executeTakeFirstOrThrow();

  expect(commit).toBeInstanceOf(LeaseLostError);
  expect(row).toStrictEqual({ state: 'stopped', committed_steps: 0, started_step_key: null });
});

test('it never fires a timer that a stop withdrew', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'running');

  invariant(task.claim);

  await writeStepCommit(ctx.context, task.claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_010_000 }],
  });

  await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'stop' });

  ctx.clock.advance(20_000);

  const fired = await runDueTimers(ctx.context);

  expect(fired).toBe(0);
});

test('it never claims a paused, stopped or closed task', async () => {
  const ctx = await setupTest();

  await createTestTaskInState(ctx.context, 'paused');
  await createTestTaskInState(ctx.context, 'stopped');
  await createTestTaskInState(ctx.context, 'closed');

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(claim).toBeNull();
});

test('it resumes a task paused while waiting to waiting', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'waiting');

  await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'pause' });

  const outcome = await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'resume' });

  expect(outcome).toMatchObject({ status: 'controlled', state: 'waiting' });
});

test('it resumes a task paused while waiting to ready once a message landed during the pause', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'waiting');

  await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'pause' });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: task.taskID,
      erasable: { text: 'add the receipts too' },
    },
  ]);

  const paused = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', task.taskID)
    .executeTakeFirstOrThrow();

  const outcome = await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'resume' });

  expect(paused.state).toBe('paused');
  expect(outcome).toMatchObject({ status: 'controlled', state: 'ready' });
});

test('it restarts a task stopped while waiting to waiting', async () => {
  const ctx = await setupTest();
  const task = await createTestTaskInState(ctx.context, 'waiting');

  await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'stop' });

  const outcome = await writeTaskControl(ctx.context, { taskID: task.taskID, control: 'restart' });

  expect(outcome).toMatchObject({ status: 'controlled', state: 'waiting' });
});

test('it releases the waits a stopped task opened and keeps the waits on it', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
  };

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const planner = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(planner);

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'question',
    body: 'Is Tuesday free?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await writeStepCommit(ctx.context, planner, { next: 'wait', records: [], acknowledged: [] });

  const conversation = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(conversation);

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'conversation',
    to: 'planner',
    kind: 'request',
    body: 'Book the dentist.',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await writeStepCommit(ctx.context, conversation, {
    next: 'wait',
    records: [],
    acknowledged: [],
  });

  await writeTaskControl(ctx.context, { taskID: 'planner', control: 'stop' });

  const rows = await ctx.db
    .selectFrom('task_messages')
    .select(['from_task', 'wait_state'])
    .orderBy('sent_sequence')
    .execute();

  expect(rows).toStrictEqual([
    { from_task: 'planner', wait_state: 'released' },
    { from_task: 'conversation', wait_state: 'open' },
  ]);
});

test('it releases every wait of a closed task', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
  };

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const planner = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(planner);

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'question',
    body: 'Is Tuesday free?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await writeStepCommit(ctx.context, planner, { next: 'wait', records: [], acknowledged: [] });

  const conversation = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(conversation);

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'conversation',
    to: 'planner',
    kind: 'request',
    body: 'Book the dentist.',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await writeStepCommit(ctx.context, conversation, {
    next: 'wait',
    records: [],
    acknowledged: [],
  });

  await writeTaskControl(ctx.context, { taskID: 'planner', control: 'close' });

  const rows = await ctx.db
    .selectFrom('task_messages')
    .select(['from_task', 'wait_state'])
    .orderBy('sent_sequence')
    .execute();

  expect(rows).toStrictEqual([
    { from_task: 'planner', wait_state: 'released' },
    { from_task: 'conversation', wait_state: 'released' },
  ]);
});
