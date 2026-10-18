import { expect, onTestFinished, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { createActor } from 'xstate';
import { definitionsPollMachine } from './definitions-poll-machine';

function setupTest() {
  const clock = buildTestClock(0);

  return { clock };
}

test('it waits first', () => {
  const ctx = setupTest();

  const poll = createActor(definitionsPollMachine, {
    input: {
      probe: () => Promise.resolve('rev-1'),
      seed: () => Promise.resolve(true),
      clock: ctx.clock,
      intervalMs: 60_000,
      retryDelayMs: 1000,
      isRefusedAtStart: false,
      onProbed: () => {},
      onError: () => {},
    },
  });

  poll.start();

  onTestFinished(() => {
    poll.stop();
  });

  expect(poll.getSnapshot().value).toBe('waiting');
});

test('it moves from waiting to probing once the wait passes', async () => {
  const ctx = setupTest();

  const poll = createActor(definitionsPollMachine, {
    input: {
      probe: () => Promise.withResolvers<never>().promise,
      seed: () => Promise.resolve(true),
      clock: ctx.clock,
      intervalMs: 60_000,
      retryDelayMs: 1000,
      isRefusedAtStart: false,
      onProbed: () => {},
      onError: () => {},
    },
  });

  poll.start();

  onTestFinished(() => {
    poll.stop();
  });

  ctx.clock.advance(60_000);

  await expect(waitForCondition(() => poll.getSnapshot().value === 'probing')).toResolve();
});

test('it moves from probing back to waiting once the probe ends', async () => {
  const ctx = setupTest();
  const probing = Promise.withResolvers<string>();

  const poll = createActor(definitionsPollMachine, {
    input: {
      probe: () => probing.promise,
      seed: () => Promise.resolve(true),
      clock: ctx.clock,
      intervalMs: 60_000,
      retryDelayMs: 1000,
      isRefusedAtStart: false,
      onProbed: () => {},
      onError: () => {},
    },
  });

  poll.start();

  onTestFinished(() => {
    poll.stop();
  });

  ctx.clock.advance(60_000);

  await waitForCondition(() => poll.getSnapshot().value === 'probing');

  probing.resolve('rev-1');

  await expect(waitForCondition(() => poll.getSnapshot().value === 'waiting')).toResolve();
});

test('it moves from waiting to stopped at once on a stop', () => {
  const ctx = setupTest();

  const poll = createActor(definitionsPollMachine, {
    input: {
      probe: () => Promise.resolve('rev-1'),
      seed: () => Promise.resolve(true),
      clock: ctx.clock,
      intervalMs: 60_000,
      retryDelayMs: 1000,
      isRefusedAtStart: false,
      onProbed: () => {},
      onError: () => {},
    },
  });

  poll.start();

  onTestFinished(() => {
    poll.stop();
  });

  poll.send({ type: 'stop' });

  expect(poll.getSnapshot().value).toBe('stopped');
});

test('it ends the wait when it stops', () => {
  const ctx = setupTest();

  const poll = createActor(definitionsPollMachine, {
    input: {
      probe: () => Promise.resolve('rev-1'),
      seed: () => Promise.resolve(true),
      clock: ctx.clock,
      intervalMs: 60_000,
      retryDelayMs: 1000,
      isRefusedAtStart: false,
      onProbed: () => {},
      onError: () => {},
    },
  });

  poll.start();

  onTestFinished(() => {
    poll.stop();
  });

  poll.send({ type: 'stop' });

  expect(ctx.clock.countSleepers()).toBe(0);
});

test('it keeps probing on a stop while a probe runs', async () => {
  const ctx = setupTest();

  const poll = createActor(definitionsPollMachine, {
    input: {
      probe: () => Promise.withResolvers<never>().promise,
      seed: () => Promise.resolve(true),
      clock: ctx.clock,
      intervalMs: 60_000,
      retryDelayMs: 1000,
      isRefusedAtStart: false,
      onProbed: () => {},
      onError: () => {},
    },
  });

  poll.start();

  onTestFinished(() => {
    poll.stop();
  });

  ctx.clock.advance(60_000);

  await waitForCondition(() => poll.getSnapshot().value === 'probing');

  poll.send({ type: 'stop' });

  expect(poll.getSnapshot().value).toBe('probing');
});

test('it moves from probing to stopped once the probe ends after a stop', async () => {
  const ctx = setupTest();
  const probing = Promise.withResolvers<string>();

  const poll = createActor(definitionsPollMachine, {
    input: {
      probe: () => probing.promise,
      seed: () => Promise.resolve(true),
      clock: ctx.clock,
      intervalMs: 60_000,
      retryDelayMs: 1000,
      isRefusedAtStart: false,
      onProbed: () => {},
      onError: () => {},
    },
  });

  poll.start();

  onTestFinished(() => {
    poll.stop();
  });

  ctx.clock.advance(60_000);

  await waitForCondition(() => poll.getSnapshot().value === 'probing');

  poll.send({ type: 'stop' });
  probing.resolve('rev-1');

  await expect(waitForCondition(() => poll.getSnapshot().value === 'stopped')).toResolve();
});
