import { expect, mock, test } from 'bun:test';
import { StaleCheckerError } from './stale-checker-error';
import { withFreshChecker } from './with-fresh-checker';

test('it gives up after three stale checkers', async () => {
  const run = mock(() => Promise.reject(new StaleCheckerError('sha256:before', 'sha256:after')));
  const outcome = withFreshChecker(run);

  await outcome.catch(() => {});

  expect(outcome).rejects.toBeInstanceOf(StaleCheckerError);
  expect(run).toHaveBeenCalledTimes(3);
});

test('it never runs the call again after another error', async () => {
  const run = mock(() => Promise.reject(new Error('the disk is full')));
  const outcome = withFreshChecker(run);

  await outcome.catch(() => {});

  expect(outcome).rejects.toThrow('the disk is full');
  expect(run).toHaveBeenCalledOnce();
});
