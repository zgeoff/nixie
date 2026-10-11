import { expect, test } from 'bun:test';
import { runWithRetry } from './run-with-retry';

test('it runs the step again after each failure until it succeeds, logging each failure', async () => {
  const lines: unknown[] = [];
  const failures = [new Error('impd does not answer'), new Error('impd does not answer')];

  const result = await runWithRetry(
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
      firstDelayMs: 1,
      maxDelayMs: 2,
    },
  );

  expect(result).toBe('added');
  expect(lines).toStrictEqual([
    {
      event: 'start.retry',
      step: 'add_images',
      delayMs: 1,
      error: 'Error',
      message: 'impd does not answer',
    },
    {
      event: 'start.retry',
      step: 'add_images',
      delayMs: 2,
      error: 'Error',
      message: 'impd does not answer',
    },
  ]);
});

test('it stops retrying once the signal aborts', () => {
  const stopping = new AbortController();

  const result = runWithRetry(
    () => {
      stopping.abort(new Error('nixie is stopping'));
      return Promise.reject(new Error('impd does not answer'));
    },
    { step: 'add_images', signal: stopping.signal, log: () => {}, firstDelayMs: 60_000 },
  );

  expect(result).rejects.toThrow('nixie is stopping');
});
