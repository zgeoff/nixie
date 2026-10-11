import { expect, onTestFinished, test } from 'bun:test';
import { createTask } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import { createAllowedAction } from './create-allowed-action';
import { startActionRunners } from './start-action-runners';
import { buildStubConnector } from './test-utils/build-stub-connector';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionCall, ActionsTables, ProviderResponse } from './types';

async function setupTest() {
  const actions = await startTestActions();
  const db = actions.writer.db.$extendTables<ActionsTables>();
  const taskID = await createTask(actions.context, 'send the weekly summary');
  const createQueuedAction = (hash: string) =>
    createAllowedAction(actions.context, {
      taskID,
      stepKey: `${taskID}:1`,
      tool: 'test.send',
      actionHash: hash,
      arguments: { to: 'team' },
      decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    });

  // starts the default pool over a test.send connector, and stops it when the test finishes
  const startRunners = (respond: (call: ActionCall) => Promise<ProviderResponse>) => {
    const stub = buildStubConnector(respond);
    const runners = startActionRunners(actions.context, {
      connectors: new Map([['test.send', stub.connector]]),
      onError: () => {},
    });

    onTestFinished(async () => {
      await runners.stop(0);
    });
    return stub;
  };

  return { ...actions, db, createQueuedAction, startRunners };
}

test('it retries a refusal that can clear on the schedule, and fails it on the fifth attempt', async () => {
  const ctx = await setupTest();
  const attemptTimes: number[] = [];

  await ctx.createQueuedAction('sha256:send-1');
  ctx.startRunners(() => {
    attemptTimes.push(ctx.clock.now());
    return Promise.resolve({ kind: 'refused_retryable', reason: 'rate limited' });
  });

  // after each attempt settles, time moves on by the delay before the next one
  for (const [index, delayMs] of [30_000, 120_000, 480_000, 1_800_000, 0].entries()) {
    // oxlint-disable-next-line no-await-in-loop -- each attempt settles before time moves on
    await waitForCondition(async () => {
      const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

      return action.attempt_count === index + 1 && action.attempt_open === 0;
    });
    ctx.clock.advance(delayMs);
  }

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  expect(attemptTimes).toStrictEqual([1_000_000, 1_030_000, 1_150_000, 1_630_000, 3_430_000]);
  expect(action).toMatchObject({ status: 'failed', reason: 'retries_exhausted' });
});

test('it runs 4 actions at once by default', async () => {
  const ctx = await setupTest();
  const unanswered = Promise.withResolvers<ProviderResponse>();

  onTestFinished(() => {
    unanswered.resolve({ kind: 'success', result: {} });
  });
  await Promise.all(
    ['sha256:1', 'sha256:2', 'sha256:3', 'sha256:4', 'sha256:5'].map((hash) =>
      ctx.createQueuedAction(hash),
    ),
  );

  const stub = ctx.startRunners(() => unanswered.promise);

  // 4 runners each renew a lease mid-call, so none is free to claim the fifth action
  await waitForCondition(() => stub.calls.length === 4 && ctx.clock.countSleepers() === 4);

  const untouched = await ctx.db
    .selectFrom('actions')
    .select('action_id')
    .where('attempt_count', '=', 0)
    .execute();

  expect(untouched).toHaveLength(1);
});
