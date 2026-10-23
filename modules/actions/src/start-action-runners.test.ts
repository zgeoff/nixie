import { expect, onTestFinished, test } from 'bun:test';
import type { ProviderResponse } from '@heynixie/connectors';
import { buildRecordedCommits } from '@heynixie/log/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { createAllowedAction } from './create-allowed-action';
import { startActionRunners } from './start-action-runners';
import { buildStubConnector } from './test-utils/build-stub-connector';
import { createTestStep } from './test-utils/create-test-step';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test('it retries a refusal that can clear on the schedule', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const attemptTimes: number[] = [];

  await createAllowedAction(ctx.context, {
    step,
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
  const step = await createTestStep(ctx.context);

  await createAllowedAction(ctx.context, {
    step,
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

test('it attempts an action queued while every runner sleeps without waiting for the poll', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const stub = buildStubConnector(() => ({ kind: 'success', result: { delivered: true } }));

  const runners = startActionRunners(ctx.context, {
    connectors: new Map([['test.send', stub.connector]]),
    onError: () => {},
  });

  onTestFinished(() => runners.stop(0));

  await waitForCondition(() => ctx.clock.countSleepers() === 4);

  const queuedAt = ctx.clock.now();

  await createAllowedAction(ctx.context, {
    step,
    tool: 'test.send',
    actionHash: 'sha256:send-1',
    arguments: { to: 'team' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  await waitForCondition(() => stub.calls.length === 1);

  expect(ctx.clock.now()).toBe(queuedAt);
});

test('it removes its commit listener once stopped', async () => {
  const ctx = await setupTest();

  const recorded = buildRecordedCommits();

  const runners = startActionRunners(
    {
      ...ctx.context,
      log: { ...ctx.context.log, writer: { ...ctx.context.log.writer, commits: recorded.commits } },
    },
    { connectors: new Map(), onError: () => {} },
  );

  await runners.stop(0);

  expect(recorded.calls).toStrictEqual(['add commit', 'remove commit']);
});

test('it runs 4 actions at once by default', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);

  const unanswered = Promise.withResolvers<ProviderResponse>();

  onTestFinished(() => {
    unanswered.resolve({ kind: 'success', result: {} });
  });

  await Promise.all(
    ['sha256:1', 'sha256:2', 'sha256:3', 'sha256:4', 'sha256:5'].map((actionHash) =>
      createAllowedAction(ctx.context, {
        step,
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

  await waitForCondition(() => stub.calls.length === 4 && ctx.clock.countSleepers() === 4);

  const untouched = await ctx.db
    .selectFrom('actions')
    .select('action_id')
    .where('attempt_count', '=', 0)
    .execute();

  expect(untouched).toHaveLength(1);
});
