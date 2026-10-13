import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { createTestClaim } from './test-utils/create-test-claim';
import { createTestConversationClaim } from './test-utils/create-test-conversation-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeStepError } from './write-step-error';

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

  // each error's retry comes due before the next claim, so the clock reads the last retry time
  for (let errors = 1; errors <= 5; errors += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each error frees the step the next claim takes
    const errored = await writeStepError(ctx.context, claims.next, {
      error: new Error('the provider is overloaded'),
      maxStepErrors: 3,
      retryDelayMs: 30_000,
      maxRetryDelayMs: 100_000,
    });

    ctx.clock.advance(errored.retryAt - ctx.clock.now());

    // oxlint-disable-next-line no-await-in-loop -- each claim takes the step the last error freed
    const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

    invariant(claim);
    claims.next = claim;
  }

  const entries = await readRecords(ctx.context.log, { afterSequence: 0 });

  // 30 s, 60 s, then 100 s three times
  expect(
    entries
      .filter((entry) => entry.record.kind === 'task.step_errored')
      .map((entry) => entry.record.payload['claimableAt']),
  ).toStrictEqual([1_030_000, 1_090_000, 1_190_000, 1_290_000, 1_390_000]);
});
