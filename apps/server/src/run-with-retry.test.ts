import { expect, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { runWithRetry } from './run-with-retry';

test('it runs the step again after each failure until it succeeds, logging each failure', async () => {
  const clock = buildTestClock(1_700_000_000_000);
  const lines: unknown[] = [];
  const failures = [new Error('impd does not answer'), new Error('impd does not answer')];

  const running = runWithRetry(
    () => {
      const failure = failures.shift();

      return failure === undefined ? Promise.resolve('added') : Promise.reject(failure);
    },
    {
      step: 'add_images',
      signal: new AbortController().signal,
      log: (event, fields) => {
        lines.push({ event, ...fields });
      },
      clock,
    },
  );

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(1000);

  await waitForCondition(() => clock.countSleepers() === 1);

  clock.advance(2000);

  expect(running).resolves.toBe('added');

  expect(lines).toStrictEqual([
    {
      event: 'start.retry',
      step: 'add_images',
      delayMs: 1000,
      error: 'Error',
      message: 'impd does not answer',
    },
    {
      event: 'start.retry',
      step: 'add_images',
      delayMs: 2000,
      error: 'Error',
      message: 'impd does not answer',
    },
  ]);
});

test('it ends the wait between attempts once the signal aborts', async () => {
  const clock = buildTestClock(1_700_000_000_000);

  const stopping = new AbortController();

  const result = runWithRetry(() => Promise.reject(new Error('impd does not answer')), {
    step: 'add_images',
    signal: stopping.signal,
    log: () => {},
    clock,
  });

  await waitForCondition(() => clock.countSleepers() === 1);

  stopping.abort(new Error('nixie is stopping'));

  expect(result).rejects.toThrow('nixie is stopping');
});

test('it stops retrying once the signal aborts', () => {
  const stopping = new AbortController();

  const result = runWithRetry(
    () => {
      stopping.abort(new Error('nixie is stopping'));

      return Promise.reject(new Error('impd does not answer'));
    },
    {
      step: 'add_images',
      signal: stopping.signal,
      log: () => {},
      clock: buildTestClock(1_700_000_000_000),
      firstDelayMs: 60_000,
    },
  );

  expect(result).rejects.toThrow('nixie is stopping');
});
