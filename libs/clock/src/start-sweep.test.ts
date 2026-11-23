import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitFor } from '@zgeoff/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import type { SweepOptions } from './start-sweep';
import { startSweep } from './start-sweep';

function setupTest() {
  const clock = createFakeClock({ startMs: 0 });
  const run = mock<() => Promise<unknown>>(() => Promise.resolve());

  const start = (options: Partial<SweepOptions> = {}) => {
    const sweep = startSweep({
      clock,
      intervalMs: 1000,
      run,
      onError: () => {},
      ...options,
    });

    onTestFinished(() => sweep.stop());

    return sweep;
  };

  const waitForSleep = () =>
    waitFor(() => {
      expect(clock.countPending()).toBe(1);
    });

  // The run in flight ends when a test calls finish.
  const holdRun = () => {
    const held = Promise.withResolvers<void>();

    run.mockImplementationOnce(() => held.promise);

    return held.resolve;
  };

  return { clock, run, start, waitForSleep, holdRun };
}

test('it first runs one interval after the start', async () => {
  const ctx = setupTest();

  ctx.start();

  await ctx.waitForSleep();

  ctx.clock.advance(999);

  expect(ctx.run).toHaveBeenCalledTimes(0);

  ctx.clock.advance(1);

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(1);
  });
});

test('it runs at once on the start with runOnStart', async () => {
  const ctx = setupTest();

  ctx.start({ runOnStart: true });

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(1);
  });

  expect(ctx.clock.now()).toBe(0);
});

test('it starts the next run one interval after the last run ends', async () => {
  const ctx = setupTest();
  const finish = ctx.holdRun();

  ctx.start({ runOnStart: true });

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(1);
  });

  ctx.clock.advance(5000);

  finish();

  await ctx.waitForSleep();

  expect(ctx.clock.readNextDueMs()).toBe(6000);
});

test('it never starts a run while one is in flight', async () => {
  const ctx = setupTest();
  const finish = ctx.holdRun();

  ctx.start({ runOnStart: true });

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(1);
  });

  ctx.clock.advance(10_000);

  expect(ctx.clock.countPending()).toBe(0);
  expect(ctx.run).toHaveBeenCalledTimes(1);

  finish();
});

test('it runs now on a wake during the sleep, and sleeps a fresh interval after', async () => {
  const ctx = setupTest();
  const sweep = ctx.start();

  await ctx.waitForSleep();

  ctx.clock.advance(400);
  sweep.wake();

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(1);
  });

  await ctx.waitForSleep();

  expect(ctx.clock.readNextDueMs()).toBe(1400);
});

test('it queues exactly one more run on wakes during a run', async () => {
  const ctx = setupTest();
  const finish = ctx.holdRun();
  const sweep = ctx.start({ runOnStart: true });

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(1);
  });

  sweep.wake();
  sweep.wake();

  finish();

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(2);
  });

  await ctx.waitForSleep();

  expect(ctx.run).toHaveBeenCalledTimes(2);
});

test('it passes a throw from run to onError and runs again', async () => {
  const ctx = setupTest();

  const failure = new Error('the log is closed');

  const onError = mock<(error: unknown) => void>();

  ctx.run.mockImplementation(() => Promise.reject(failure));
  ctx.start({ onError });

  await ctx.waitForSleep();

  ctx.clock.advance(1000);

  await waitFor(() => {
    expect(onError).toHaveBeenCalledTimes(1);
  });

  await ctx.waitForSleep();

  ctx.clock.advance(1000);

  await waitFor(() => {
    expect(onError.mock.calls).toStrictEqual([[failure], [failure]]);
  });
});

test('it runs again after onError throws', async () => {
  const ctx = setupTest();

  ctx.run.mockImplementation(() => Promise.reject(new Error('a fault')));

  ctx.start({
    onError: () => {
      throw new Error('the report failed');
    },
  });

  await ctx.waitForSleep();

  ctx.clock.advance(1000);

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(1);
  });

  await ctx.waitForSleep();

  ctx.clock.advance(1000);

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(2);
  });
});

test('it stops during the sleep without a run', async () => {
  const ctx = setupTest();
  const sweep = ctx.start();

  await ctx.waitForSleep();
  await sweep.stop();

  expect(ctx.clock.countPending()).toBe(0);
  expect(ctx.run).toHaveBeenCalledTimes(0);
});

test('it waits for the run in flight on stop, and runs no more', async () => {
  const ctx = setupTest();
  const finish = ctx.holdRun();
  const sweep = ctx.start({ runOnStart: true });

  await waitFor(() => {
    expect(ctx.run).toHaveBeenCalledTimes(1);
  });

  sweep.wake();

  const stopping = sweep.stop();

  finish();

  await stopping;

  expect(ctx.run).toHaveBeenCalledTimes(1);
});

test('it ignores a wake after stop', async () => {
  const ctx = setupTest();
  const sweep = ctx.start();

  await ctx.waitForSleep();
  await sweep.stop();

  sweep.wake();

  expect(ctx.run).toHaveBeenCalledTimes(0);
});
