import { expect, onTestFinished, test } from 'bun:test';
import type { ProviderResponse } from '@heynixie/connectors';
import { waitForCondition } from '@heynixie/testing';
import { createAllowedAction } from './create-allowed-action';
import { startActionRunners } from './start-action-runners';
import { buildStubConnector } from './test-utils/build-stub-connector';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

// the step that makes the tool calls, claimed by its task runner
async function setupTest() {
  const actions = await startTestActions();
  const step = await createTestStep(actions.context);

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>(), step };
}

test('it retries a refusal that can clear on the schedule', async () => {
  const ctx = await setupTest();

  const attemptTimes: number[] = [];

  await createAllowedAction(ctx.context, {
    step: ctx.step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const runners = startActionRunners(ctx.context, {
    connectors: new Map([
      [
        'test.send',
        buildStubConnector(() => {
          attemptTimes.push(ctx.clock.now());

          return Promise.resolve({ kind: 'refused_retryable', reason: 'rate limited' });
        }).connector,
      ],
    ]),
    onError: () => {},
  });

  onTestFinished(() => runners.stop(0));

  // after each attempt settles, time moves on by the delay before the next one
  for (const [index, delayMs] of [30_000, 120_000, 480_000, 1_800_000, 0].entries()) {
    await waitForCondition(async () => {
      const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

      return action.attempt_count === index + 1 && action.attempt_open === 0;
    });

    ctx.clock.advance(delayMs);
  }

  expect(attemptTimes).toStrictEqual([1_000_000, 1_030_000, 1_150_000, 1_630_000, 3_430_000]);
});

test('it fails a refusal that can clear on its fifth attempt', async () => {
  const ctx = await setupTest();

  await createAllowedAction(ctx.context, {
    step: ctx.step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const runners = startActionRunners(ctx.context, {
    connectors: new Map([
      [
        'test.send',
        buildStubConnector(() => ({ kind: 'refused_retryable', reason: 'rate limited' })).connector,
      ],
    ]),
    onError: () => {},
  });

  onTestFinished(() => runners.stop(0));

  // after each attempt settles, time moves on by the delay before the next one
  for (const [index, delayMs] of [30_000, 120_000, 480_000, 1_800_000, 0].entries()) {
    await waitForCondition(async () => {
      const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

      return action.attempt_count === index + 1 && action.attempt_open === 0;
    });

    ctx.clock.advance(delayMs);
  }

  const action = await ctx.db.selectFrom('actions').selectAll().executeTakeFirstOrThrow();

  expect(action).toMatchObject({ status: 'failed', reason: 'retries_exhausted' });
});

test('it runs 4 actions at once by default', async () => {
  const ctx = await setupTest();

  const unanswered = Promise.withResolvers<ProviderResponse>();

  onTestFinished(() => {
    unanswered.resolve({ kind: 'success', result: {} });
  });

  await Promise.all(
    ['sha256:1', 'sha256:2', 'sha256:3', 'sha256:4', 'sha256:5'].map((actionHash) =>
      createAllowedAction(ctx.context, {
        step: ctx.step,
        tool: 'test.send',
        actionHash,
        arguments: { to: 'team' },
        decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
      }),
    ),
  );

  const stub = buildStubConnector(() => unanswered.promise);

  const runners = startActionRunners(ctx.context, {
    connectors: new Map([['test.send', stub.connector]]),
    onError: () => {},
  });

  onTestFinished(() => runners.stop(0));

  // 4 runners each renew a lease mid-call, so none is free to claim the fifth action
  await waitForCondition(() => stub.calls.length === 4 && ctx.clock.countSleepers() === 4);

  const untouched = await ctx.db
    .selectFrom('actions')
    .select('action_id')
    .where('attempt_count', '=', 0)
    .execute();

  expect(untouched).toHaveLength(1);
});
