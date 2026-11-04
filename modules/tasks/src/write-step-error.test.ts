import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { StepFailedError } from './step-failed-error';
import { createTestClaim } from './test-utils/create-test-claim';
import { createTestConversationClaim } from './test-utils/create-test-conversation-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepError } from './write-step-error';
import { writeTaskControl } from './write-task-control';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it returns a task whose step threw to ready, after the retry delay', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({
    state: 'ready',
    step_errors: 1,
    claimable_at: 1_030_000,
    started_step_key: null,
  });
});

test('it fails a task once its steps threw the limit of times in a row', async () => {
  const ctx = await setupTest();
  const first = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepError(ctx.context, first, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 2,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  ctx.clock.advance(30_000);

  const second = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(second);

  await writeStepError(ctx.context, second, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 2,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({ state: 'failed', step_errors: 2 });
});

test('it keeps the error text in the erasable fields of its record', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: 2 });

  expect(entries.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'task.step_errored',
      payload: {
        taskID: claim.lease.workID,
        stepKey: claim.stepKey,
        nextState: 'ready',
        errors: 1,
        errorLimit: 3,
        claimableAt: 1_030_000,
      },
      erasable: { status: 'readable', fields: { message: 'the model profile is unreachable' } },
    },
  ]);
});

test('it returns the conversation to ready when its errors in a row pass the limit', async () => {
  const ctx = await setupTest();
  const first = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeStepError(ctx.context, first, {
    error: new Error('the provider is overloaded'),
    maxStepErrors: 1,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  ctx.clock.advance(30_000);

  const second = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(second);

  const errored = await writeStepError(ctx.context, second, {
    error: new Error('the provider is overloaded'),
    maxStepErrors: 1,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db.selectFrom('tasks').selectAll().executeTakeFirstOrThrow();

  expect(task).toMatchObject({ state: 'ready', step_errors: 2, claimable_at: 1_090_000 });
  expect(errored).toMatchObject({ nextState: 'ready', errors: 2, errorLimit: 1 });
});

test("it doubles the conversation's retry delay with each error until the delay reaches its cap", async () => {
  const ctx = await setupTest();

  const claims = { next: await createTestConversationClaim(ctx.context, 'what is on today?') };

  for (let errors = 1; errors <= 5; errors += 1) {
    const errored = await writeStepError(ctx.context, claims.next, {
      error: new Error('the provider is overloaded'),
      maxStepErrors: 3,
      retryDelayMs: 30_000,
      maxRetryDelayMs: 100_000,
    });

    ctx.clock.advance(errored.retryAt - ctx.clock.now());

    const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

    invariant(claim);

    claims.next = claim;
  }

  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(
    entries
      .filter((entry) => entry.record.kind === 'task.step_errored')
      .map((entry) => entry.record.payload['claimableAt']),
  ).toStrictEqual([1_030_000, 1_090_000, 1_190_000, 1_290_000, 1_390_000]);
});

test('it leaves the conversation waiting, with no claim, when its step failed for a reason that waits for the owner', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeStepError(ctx.context, claim, {
    error: new StepFailedError('the weekly allowance is used up', {
      reason: 'quota',
      isWaitingForOwner: true,
      records: [],
    }),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  ctx.clock.advance(86_400_000);

  const next = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });
  const task = await ctx.db.selectFrom('tasks').select('state').executeTakeFirstOrThrow();

  expect({ next, state: task.state }).toStrictEqual({ next: null, state: 'waiting' });
});

test('it claims a conversation that waits for its owner once a message arrives', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeStepError(ctx.context, claim, {
    error: new StepFailedError('the weekly allowance is used up', {
      reason: 'quota',
      isWaitingForOwner: true,
      records: [],
    }),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      erasable: { text: 'and tomorrow?' },
    },
  ]);

  const next = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(next?.lease.workID).toBe('conversation');
});

test('it claims a conversation at once when a message arrived while its step failed for a reason that waits for the owner', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      erasable: { text: 'and tomorrow?' },
    },
  ]);

  await writeStepError(ctx.context, claim, {
    error: new StepFailedError('the weekly allowance is used up', {
      reason: 'quota',
      isWaitingForOwner: true,
      records: [],
    }),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const next = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(next?.lease.workID).toBe('conversation');
});

test('it retries the conversation after its backoff when its step failed for a reason that retries on its own', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'what is on today?');

  const errored = await writeStepError(ctx.context, claim, {
    error: new StepFailedError('the provider is overloaded', {
      reason: 'overloaded',
      isWaitingForOwner: false,
      records: [],
    }),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  expect(errored).toStrictEqual({
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    errors: 1,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_030_000,
    error: expect.any(StepFailedError),
  });
});

test('it retries a task that is not the conversation after its delay, even for a reason that waits for the owner', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  const errored = await writeStepError(ctx.context, claim, {
    error: new StepFailedError('the weekly allowance is used up', {
      reason: 'quota',
      isWaitingForOwner: true,
      records: [],
    }),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  expect(errored).toStrictEqual({
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    errors: 1,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_030_000,
    error: expect.any(StepFailedError),
  });
});

test("it writes a failed step's records and its reason on the task's thread, before the error", async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeStepError(ctx.context, claim, {
    error: new StepFailedError('the weekly allowance is used up', {
      reason: 'quota',
      isWaitingForOwner: true,
      records: [
        {
          kind: 'turn_finished',
          definitions: ctx.context.definitions(),
          payload: { note: 'checked the calendar' },
        },
      ],
    }),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const entries = await readRecords(ctx.context.log, { afterSequence: claim.startSequence });

  expect(
    entries.map((entry) => [
      entry.record.kind,
      entry.record.thread,
      entry.record.payload,
      entry.record.erasable,
    ]),
  ).toStrictEqual([
    ['turn_finished', 'conversation', { note: 'checked the calendar' }, { status: 'none' }],
    [
      'task.step_errored',
      'conversation',
      {
        taskID: 'conversation',
        stepKey: claim.stepKey,
        nextState: 'waiting',
        errors: 1,
        errorLimit: 3,
        reason: 'quota',
        claimableAt: 1_000_000,
      },
      { status: 'readable', fields: { message: 'the weekly allowance is used up' } },
    ],
  ]);
});

test('it pauses a task whose pause waited on the step that threw', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeTaskControl(ctx.context, { taskID: claim.lease.workID, control: 'pause' });

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'resume_state'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ state: 'paused', resume_state: 'ready' });
});

test('it pauses the conversation to resume waiting when its pause waited on a step that failed for a reason that waits for the owner', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'pause' });

  await writeStepError(ctx.context, claim, {
    error: new StepFailedError('the weekly allowance is used up', {
      reason: 'quota',
      isWaitingForOwner: true,
      records: [],
    }),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'resume_state'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ state: 'paused', resume_state: 'waiting' });
});

test('it fails a task whose pause waited on the step that used its last try', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeTaskControl(ctx.context, { taskID: claim.lease.workID, control: 'pause' });

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 1,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const task = await ctx.db.selectFrom('tasks').select('state').executeTakeFirstOrThrow();

  expect(task.state).toBe('failed');
});

test('it runs a step of a task that failed while its pause waited, once the task restarts', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeTaskControl(ctx.context, { taskID: claim.lease.workID, control: 'pause' });

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 1,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  await writeTaskControl(ctx.context, { taskID: claim.lease.workID, control: 'restart' });

  const next = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'pause_requested'])
    .executeTakeFirstOrThrow();

  expect(next?.lease.workID).toBe(claim.lease.workID);
  expect(task).toStrictEqual({ state: 'running', pause_requested: 0 });
});
