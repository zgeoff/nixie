import { expect, onTestFinished, test } from 'bun:test';
import { buildStubCheck, buildTestClock, waitForCondition } from '@heynixie/testing';
import { createActor } from 'xstate';
import { partRefreshMachine } from './part-refresh-machine';
import type { PartReport } from './types';

function setupTest() {
  const clock = buildTestClock(0);

  return { clock };
}

test('it checks first', () => {
  const ctx = setupTest();

  const refresh = createActor(partRefreshMachine, {
    input: {
      checks: { disk: () => Promise.withResolvers<never>().promise },
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    },
  });

  refresh.start();

  onTestFinished(() => {
    refresh.stop();
  });

  expect(refresh.getSnapshot().value).toBe('checking');
});

test('it moves from checking to waiting once the round ends', async () => {
  const ctx = setupTest();

  const refresh = createActor(partRefreshMachine, {
    input: {
      checks: { disk: () => Promise.resolve({ isReady: true, reason: null }) },
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    },
  });

  refresh.start();

  onTestFinished(() => {
    refresh.stop();
  });

  await expect(waitForCondition(() => refresh.getSnapshot().value === 'waiting')).toResolve();
});

test('it moves from waiting to checking once the interval passes', async () => {
  const ctx = setupTest();
  const stub = buildStubCheck<PartReport>(() => Promise.resolve({ isReady: true, reason: null }));

  const refresh = createActor(partRefreshMachine, {
    input: {
      checks: { disk: stub.check },
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    },
  });

  refresh.start();

  onTestFinished(() => {
    refresh.stop();
  });

  await waitForCondition(() => refresh.getSnapshot().value === 'waiting');

  stub.answerWith(() => Promise.withResolvers<PartReport>().promise);
  ctx.clock.advance(5000);

  await expect(waitForCondition(() => refresh.getSnapshot().value === 'checking')).toResolve();
});

test('it moves from waiting to stopped at once on a stop', async () => {
  const ctx = setupTest();

  const refresh = createActor(partRefreshMachine, {
    input: {
      checks: { disk: () => Promise.resolve({ isReady: true, reason: null }) },
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    },
  });

  refresh.start();

  onTestFinished(() => {
    refresh.stop();
  });

  await waitForCondition(() => refresh.getSnapshot().value === 'waiting');

  refresh.send({ type: 'stop' });

  expect(refresh.getSnapshot().value).toBe('stopped');
});

test('it keeps checking on a stop while a round runs', () => {
  const ctx = setupTest();

  const refresh = createActor(partRefreshMachine, {
    input: {
      checks: { disk: () => Promise.withResolvers<never>().promise },
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    },
  });

  refresh.start();

  onTestFinished(() => {
    refresh.stop();
  });

  refresh.send({ type: 'stop' });

  expect(refresh.getSnapshot().value).toBe('checking');
});

test('it moves from checking to stopped once the round ends after a stop', async () => {
  const ctx = setupTest();
  const checking = Promise.withResolvers<PartReport>();

  const refresh = createActor(partRefreshMachine, {
    input: {
      checks: { disk: () => checking.promise },
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    },
  });

  refresh.start();

  onTestFinished(() => {
    refresh.stop();
  });

  refresh.send({ type: 'stop' });
  checking.resolve({ isReady: true, reason: null });

  await expect(waitForCondition(() => refresh.getSnapshot().value === 'stopped')).toResolve();
});

test('it keeps the report of the round that ends after a stop', async () => {
  const ctx = setupTest();
  const checking = Promise.withResolvers<PartReport>();

  const refresh = createActor(partRefreshMachine, {
    input: {
      checks: { disk: () => checking.promise },
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    },
  });

  refresh.start();

  onTestFinished(() => {
    refresh.stop();
  });

  refresh.send({ type: 'stop' });
  checking.resolve({ isReady: false, reason: 'the data volume is 95% full' });

  await waitForCondition(() => refresh.getSnapshot().value === 'stopped');

  expect(refresh.getSnapshot().context.reports).toStrictEqual({
    disk: { isReady: false, reason: 'the data volume is 95% full' },
  });
});

test('it marks a part running while its check outlasts the timeout', async () => {
  const ctx = setupTest();

  const refresh = createActor(partRefreshMachine, {
    input: {
      checks: { imp_runtime: () => Promise.withResolvers<never>().promise },
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    },
  });

  refresh.start();

  onTestFinished(() => {
    refresh.stop();
  });

  ctx.clock.advance(2000);

  await waitForCondition(() => refresh.getSnapshot().value === 'waiting');

  expect(refresh.getSnapshot().context.running).toStrictEqual(new Set(['imp_runtime']));
});

test('it clears a part from running once its late check settles', async () => {
  const ctx = setupTest();
  const slow = Promise.withResolvers<PartReport>();

  const refresh = createActor(partRefreshMachine, {
    input: {
      checks: { imp_runtime: () => slow.promise },
      clock: ctx.clock,
      intervalMs: 5000,
      timeoutMs: 2000,
    },
  });

  refresh.start();

  onTestFinished(() => {
    refresh.stop();
  });

  ctx.clock.advance(2000);

  await waitForCondition(() => refresh.getSnapshot().value === 'waiting');

  slow.resolve({ isReady: true, reason: null });

  await expect(
    waitForCondition(() => refresh.getSnapshot().context.running.size === 0),
  ).toResolve();
});
