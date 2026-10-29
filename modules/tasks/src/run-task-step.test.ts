import { expect, mock, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { runTaskStep } from './run-task-step';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { StepInput, StepResult, TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it gives the step its unread inbox and commits what the step returns', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runStep = mock<(input: StepInput) => Promise<StepResult>>(() =>
    Promise.resolve({ next: 'wait', records: [], acknowledged: [2] }),
  );

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  await runTaskStep(ctx.context, claim, {
    runStep,
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(runStep.mock.calls).toMatchObject([
    [
      {
        taskID: 'conversation',
        stepKey: 'conversation:1',
        inbox: [{ sequence: 2, erasable: { fields: { text: 'what is on today?' } } }],
        sessionBoundary: null,
      },
    ],
  ]);

  expect(task).toMatchObject({ state: 'waiting', read_cursor: 2 });
});

test('it gives the next step the session boundary the last commit recorded', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runStep = mock<(input: StepInput) => Promise<StepResult>>(() =>
    Promise.resolve({ next: 'wait', records: [], acknowledged: [] }),
  );

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const first = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(first);

  await runTaskStep(ctx.context, first, {
    runStep: () =>
      Promise.resolve<StepResult>({
        next: 'continue',
        records: [],
        acknowledged: [2],
        sessionBoundary: 'boundary-1',
      }),
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const next = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(next);

  await runTaskStep(ctx.context, next, {
    runStep,
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  expect(runStep.mock.calls).toMatchObject([
    [{ stepKey: 'conversation:2', sessionBoundary: 'boundary-1' }],
  ]);
});

test('it records the error when the step throws', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  await runTaskStep(ctx.context, claim, {
    runStep: () => Promise.reject(new Error('the model profile is unreachable')),
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({ state: 'ready', step_errors: 1, read_cursor: 0 });
});

test('it records the error when the commit refuses what the step returned', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  await runTaskStep(ctx.context, claim, {
    runStep: () =>
      Promise.resolve<StepResult>({
        next: 'wait',
        records: [],
        acknowledged: [2],
        timers: [{ dueAt: Number.NaN }],
      }),
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({ state: 'ready', step_errors: 1, read_cursor: 0 });
});

test('it aborts the step and commits nothing once the lease is lost', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const seen = { aborted: false };

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  await runTaskStep(ctx.context, claim, {
    runStep: async (input) => {
      await waitForCondition(() => ctx.clock.countSleepers() === 1);

      ctx.clock.advance(60_000);

      await waitForCondition(() => input.signal.aborted);

      seen.aborted = input.signal.aborted;

      return { next: 'done', records: [], acknowledged: [2] };
    },
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(seen.aborted).toBeTrue();
  expect(task).toMatchObject({ state: 'running', committed_steps: 0 });
});

test('it aborts a running step that the user stops, and commits nothing', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  const errored = await runTaskStep(ctx.context, claim, {
    runStep: async (input) => {
      await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'stop' });
      await waitForCondition(() => input.signal.aborted);

      input.signal.throwIfAborted();

      return { next: 'wait', records: [], acknowledged: [2] };
    },
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'committed_steps', 'step_errors'])
    .executeTakeFirstOrThrow();

  expect(errored).toBeNull();
  expect(task).toStrictEqual({ state: 'stopped', committed_steps: 0, step_errors: 0 });
});

test('it tells a running step that the user interrupted it, and commits what the step returns', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  const seen = { isSignalAborted: true };

  await runTaskStep(ctx.context, claim, {
    runStep: async (input) => {
      await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'interrupt' });
      await waitForCondition(() => input.interrupt.aborted);

      seen.isSignalAborted = input.signal.aborted;

      return { next: 'wait', records: [], acknowledged: [2] };
    },
    leaseMs: 60_000,
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'committed_steps'])
    .executeTakeFirstOrThrow();

  expect(seen.isSignalAborted).toBeFalse();
  expect(task).toStrictEqual({ state: 'waiting', committed_steps: 1 });
});
