import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { startProposalLapseSweep } from './start-proposal-lapse-sweep';

function setupTest() {
  const clock = buildTestClock(0);

  return { clock };
}

test('it runs the sweep again once each interval passes', async () => {
  const ctx = setupTest();
  const sweep = mock(() => Promise.resolve(0));

  const lapses = startProposalLapseSweep({
    sweep,
    clock: ctx.clock,
    intervalMs: 3_600_000,
    onError: () => {},
  });

  onTestFinished(() => lapses.stop());

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => sweep.mock.calls.length === 1 && ctx.clock.countSleepers() === 1);

  ctx.clock.advance(3_600_000);

  await expect(waitForCondition(() => sweep.mock.calls.length === 2)).toResolve();
});

test('it passes a failed sweep to onError, and sweeps again', async () => {
  const ctx = setupTest();

  const failure = new Error('the log is closed');

  const onError = mock<(error: unknown) => void>();

  const lapses = startProposalLapseSweep({
    sweep: () => Promise.reject(failure),
    clock: ctx.clock,
    intervalMs: 3_600_000,
    onError,
  });

  onTestFinished(() => lapses.stop());

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => onError.mock.calls.length === 1 && ctx.clock.countSleepers() === 1);

  ctx.clock.advance(3_600_000);

  await waitForCondition(() => onError.mock.calls.length === 2);

  expect(onError.mock.calls).toStrictEqual([[failure], [failure]]);
});
