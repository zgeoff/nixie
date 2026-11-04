import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { StepFailedError } from './step-failed-error';
import { createTestConversationClaim } from './test-utils/create-test-conversation-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeConversationRetryInTransaction } from './write-conversation-retry-in-transaction';
import { writeStepCommit } from './write-step-commit';
import { writeStepError } from './write-step-error';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    db: tasks.writer.db.$extendTables<TasksTables>(),
    retry: () =>
      withWriteTransaction(tasks.context.log.writer, (tx) =>
        writeConversationRetryInTransaction(tx, tasks.context),
      ),
  };
}

test('it makes a conversation that waits for the owner after a failed step claimable at once', async () => {
  const ctx = await setupTest();
  const failed = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeStepError(ctx.context, failed, {
    error: new StepFailedError('the weekly allowance is used up', {
      reason: 'quota',
      isWaitingForOwner: true,
      records: [],
    }),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const outcome = await ctx.retry();
  const next = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect({ outcome, taskID: next?.lease.workID }).toStrictEqual({
    outcome: { status: 'retried' },
    taskID: 'conversation',
  });
});

test('it ends the backoff of a conversation whose step failed, so its next step runs at once', async () => {
  const ctx = await setupTest();
  const failed = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeStepError(ctx.context, failed, {
    error: new Error('the provider is overloaded'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  await ctx.retry();

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'step_errors', 'claimable_at'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ state: 'ready', step_errors: 0, claimable_at: 0 });
});

test('it refuses to retry a conversation whose last step committed', async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

  const outcome = await ctx.retry();

  expect(outcome).toStrictEqual({ status: 'refused' });
});

test('it refuses to retry a conversation whose failed step runs again already', async () => {
  const ctx = await setupTest();
  const failed = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeStepError(ctx.context, failed, {
    error: new Error('the provider is overloaded'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  ctx.clock.advance(30_000);

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await ctx.retry();

  expect(outcome).toStrictEqual({ status: 'refused' });
});

test('it refuses to retry a conversation that never ran a step', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const outcome = await ctx.retry();

  expect(outcome).toStrictEqual({ status: 'refused' });
});
