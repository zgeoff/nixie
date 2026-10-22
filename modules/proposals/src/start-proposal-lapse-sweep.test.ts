import { expect, mock, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { startProposalLapseSweep } from './start-proposal-lapse-sweep';

test('it runs the sweep again on each interval', async () => {
  const sweep = mock(() => Promise.resolve(0));
  const lapses = startProposalLapseSweep({ sweep, intervalMs: 10, onError: () => {} });

  onTestFinished(() => lapses.stop());

  await expect(waitForCondition(() => sweep.mock.calls.length >= 2)).toResolve();
});

test('it passes a failed sweep to onError, and sweeps again', async () => {
  const failure = new Error('the log is closed');

  const onError = mock<(error: unknown) => void>();

  const lapses = startProposalLapseSweep({
    sweep: () => Promise.reject(failure),
    intervalMs: 10,
    onError,
  });

  onTestFinished(() => lapses.stop());

  await waitForCondition(() => onError.mock.calls.length >= 2);

  expect(onError.mock.calls.slice(0, 2)).toStrictEqual([[failure], [failure]]);
});
