import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { createActor } from 'xstate';
import { proposalLapseSweepMachine } from './proposal-lapse-sweep-machine';

function setupTest() {
  const clock = buildTestClock(0);

  return { clock };
}

test('it waits first', () => {
  const ctx = setupTest();
  const sweep = mock(() => Promise.resolve());

  const machine = createActor(proposalLapseSweepMachine, {
    input: { sweep, clock: ctx.clock, intervalMs: 3_600_000, onError: () => {} },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  expect(machine.getSnapshot().value).toBe('waiting');
});

test('it moves from waiting to sweeping on a tick', () => {
  const ctx = setupTest();
  const sweep = mock(() => Promise.withResolvers<void>().promise);

  const machine = createActor(proposalLapseSweepMachine, {
    input: { sweep, clock: ctx.clock, intervalMs: 3_600_000, onError: () => {} },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'tick' });

  expect(machine.getSnapshot().value).toBe('sweeping');
});

test('it ticks once the interval passes', async () => {
  const ctx = setupTest();
  const sweep = mock(() => Promise.withResolvers<void>().promise);

  const machine = createActor(proposalLapseSweepMachine, {
    input: { sweep, clock: ctx.clock, intervalMs: 3_600_000, onError: () => {} },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(3_600_000);

  await expect(waitForCondition(() => machine.getSnapshot().value === 'sweeping')).toResolve();
});

test('it starts no second sweep when the timer ticks while a sweep runs', async () => {
  const ctx = setupTest();
  const sweep = mock(() => Promise.withResolvers<void>().promise);

  const machine = createActor(proposalLapseSweepMachine, {
    input: { sweep, clock: ctx.clock, intervalMs: 3_600_000, onError: () => {} },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(sweep).toHaveBeenCalledOnce();
});

test('it starts no second sweep on a tick while a sweep runs', () => {
  const ctx = setupTest();
  const sweep = mock(() => Promise.withResolvers<void>().promise);

  const machine = createActor(proposalLapseSweepMachine, {
    input: { sweep, clock: ctx.clock, intervalMs: 3_600_000, onError: () => {} },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'tick' });
  machine.send({ type: 'tick' });

  expect(sweep).toHaveBeenCalledOnce();
});

test('it moves from sweeping to waiting once the sweep ends', async () => {
  const ctx = setupTest();
  const sweeping = Promise.withResolvers<void>();

  const machine = createActor(proposalLapseSweepMachine, {
    input: {
      clock: ctx.clock,
      sweep: () => sweeping.promise,
      intervalMs: 3_600_000,
      onError: () => {},
    },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'tick' });
  sweeping.resolve();

  await expect(waitForCondition(() => machine.getSnapshot().value === 'waiting')).toResolve();
});

test('it moves from sweeping to waiting and passes the error to onError when the sweep fails', async () => {
  const ctx = setupTest();

  const failure = new Error('the log is closed');

  const onError = mock<(error: unknown) => void>();

  const machine = createActor(proposalLapseSweepMachine, {
    input: {
      clock: ctx.clock,
      sweep: () => Promise.reject(failure),
      intervalMs: 3_600_000,
      onError,
    },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'tick' });

  await waitForCondition(() => machine.getSnapshot().value === 'waiting');

  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
});

test('it sweeps again on the tick after a failed sweep', async () => {
  const ctx = setupTest();
  const sweep = mock(() => Promise.reject(new Error('the log is closed')));

  const machine = createActor(proposalLapseSweepMachine, {
    input: { sweep, clock: ctx.clock, intervalMs: 3_600_000, onError: () => {} },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'tick' });

  await waitForCondition(() => machine.getSnapshot().value === 'waiting');

  machine.send({ type: 'tick' });

  expect(sweep).toHaveBeenCalledTimes(2);
});

test('it keeps running after a failed sweep whose onError throws', async () => {
  const ctx = setupTest();

  const machine = createActor(proposalLapseSweepMachine, {
    input: {
      clock: ctx.clock,
      sweep: () => Promise.reject(new Error('the log is closed')),
      intervalMs: 3_600_000,
      onError: () => {
        throw new Error('the report failed');
      },
    },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'tick' });

  await waitForCondition(() => machine.getSnapshot().value !== 'sweeping');

  expect(machine.getSnapshot()).toMatchObject({ status: 'active', value: 'waiting' });
});

test('it moves from waiting to stopped at once on a stop', () => {
  const ctx = setupTest();

  const machine = createActor(proposalLapseSweepMachine, {
    input: {
      clock: ctx.clock,
      sweep: () => Promise.resolve(),
      intervalMs: 3_600_000,
      onError: () => {},
    },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'stop' });

  expect(machine.getSnapshot()).toMatchObject({ status: 'done', value: 'stopped' });
});

test('it keeps sweeping on a stop while a sweep runs', () => {
  const ctx = setupTest();

  const machine = createActor(proposalLapseSweepMachine, {
    input: {
      clock: ctx.clock,
      sweep: () => Promise.withResolvers<void>().promise,
      intervalMs: 3_600_000,
      onError: () => {},
    },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'tick' });
  machine.send({ type: 'stop' });

  expect(machine.getSnapshot().value).toBe('sweeping');
});

test('it moves from sweeping to stopped once the sweep ends after a stop', async () => {
  const ctx = setupTest();
  const sweeping = Promise.withResolvers<void>();

  const machine = createActor(proposalLapseSweepMachine, {
    input: {
      clock: ctx.clock,
      sweep: () => sweeping.promise,
      intervalMs: 3_600_000,
      onError: () => {},
    },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'tick' });
  machine.send({ type: 'stop' });
  sweeping.resolve();

  await expect(waitForCondition(() => machine.getSnapshot().value === 'stopped')).toResolve();
});

test('it moves from sweeping to stopped and passes the error to onError when the sweep fails after a stop', async () => {
  const ctx = setupTest();
  const sweeping = Promise.withResolvers<void>();

  const failure = new Error('the log is closed');

  const onError = mock<(error: unknown) => void>();

  const machine = createActor(proposalLapseSweepMachine, {
    input: { clock: ctx.clock, sweep: () => sweeping.promise, intervalMs: 3_600_000, onError },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  machine.send({ type: 'tick' });
  machine.send({ type: 'stop' });
  sweeping.reject(failure);

  await waitForCondition(() => machine.getSnapshot().value === 'stopped');

  expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
});

test('it ticks no more once stopped', async () => {
  const ctx = setupTest();

  const machine = createActor(proposalLapseSweepMachine, {
    input: {
      clock: ctx.clock,
      sweep: () => Promise.resolve(),
      intervalMs: 3_600_000,
      onError: () => {},
    },
  });

  machine.start();

  onTestFinished(() => {
    machine.stop();
  });

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  machine.send({ type: 'stop' });

  expect(ctx.clock.countSleepers()).toBe(0);
});
