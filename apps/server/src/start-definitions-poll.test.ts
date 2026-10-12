import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { startDefinitionsPoll } from './start-definitions-poll';

function setupTest() {
  const clock = buildTestClock(0);

  return { clock };
}

test('it probes nothing before the interval passes', () => {
  const ctx = setupTest();
  const probe = mock(() => Promise.resolve('rev-1'));
  const poll = startDefinitionsPoll({
    probe,
    seed: () => Promise.resolve(),
    clock: ctx.clock,
    intervalMs: 60_000,
    onError: () => {},
  });

  onTestFinished(() => poll.stop());
  ctx.clock.advance(59_999);

  expect(probe).not.toHaveBeenCalled();
});

test('it seeds on the first probe token once the interval passes', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve());
  const poll = startDefinitionsPoll({
    probe: () => Promise.resolve('rev-1'),
    seed,
    clock: ctx.clock,
    intervalMs: 60_000,
    onError: () => {},
  });

  onTestFinished(() => poll.stop());
  ctx.clock.advance(60_000);

  // the poll sleeps again once its probe and seed finish
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(seed).toHaveBeenCalledOnce();
});

test('it skips the seed for a probe token it seeded already', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve());
  const poll = startDefinitionsPoll({
    probe: () => Promise.resolve('rev-1'),
    seed,
    clock: ctx.clock,
    intervalMs: 60_000,
    onError: () => {},
  });

  onTestFinished(() => poll.stop());
  ctx.clock.advance(60_000);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);
  ctx.clock.advance(60_000);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(seed).toHaveBeenCalledOnce();
});

test('it seeds again on a new probe token', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve());
  const poll = startDefinitionsPoll({
    probe: mock(() => Promise.resolve('rev-2')).mockResolvedValueOnce('rev-1'),
    seed,
    clock: ctx.clock,
    intervalMs: 60_000,
    onError: () => {},
  });

  onTestFinished(() => poll.stop());
  ctx.clock.advance(60_000);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);
  ctx.clock.advance(60_000);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(seed).toHaveBeenCalledTimes(2);
});

test('it reports a probe that throws and keeps polling', async () => {
  const ctx = setupTest();
  const onError = mock();
  const poll = startDefinitionsPoll({
    probe: () => Promise.reject(new Error('the definitions directory is gone')),
    seed: () => Promise.resolve(),
    clock: ctx.clock,
    intervalMs: 60_000,
    onError,
  });

  onTestFinished(() => poll.stop());
  ctx.clock.advance(60_000);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);
  ctx.clock.advance(60_000);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(onError.mock.calls).toStrictEqual([
    [new Error('the definitions directory is gone')],
    [new Error('the definitions directory is gone')],
  ]);
});
