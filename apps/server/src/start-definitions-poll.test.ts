import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import type { DefinitionsProbe } from './start-definitions-poll';
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
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(59_999);

  expect(probe).not.toHaveBeenCalled();
});

test('it seeds on the first probe token once the interval passes', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve(true));

  const poll = startDefinitionsPoll({
    probe: () => Promise.resolve('rev-1'),
    seed,
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
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
  const seed = mock(() => Promise.resolve(true));

  const poll = startDefinitionsPoll({
    probe: () => Promise.resolve('rev-1'),
    seed,
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(seed).toHaveBeenCalledOnce();
});

test('it seeds a probe token it seeded already while a seed outside the poll is refused', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve(true));

  const poll = startDefinitionsPoll({
    probe: () => Promise.resolve('rev-1'),
    seed,
    isRefused: () => true,
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(60_000);

  await waitForCondition(() => seed.mock.calls.length === 2);

  expect(seed).toHaveBeenCalledTimes(2);
});

test('it seeds a probe token it seeded already while the database holds a change not in force', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve(true));

  const poll = startDefinitionsPoll({
    probe: () => Promise.resolve('rev-1'),
    seed,
    probeSeedDue: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(60_000);

  await waitForCondition(() => seed.mock.calls.length === 2);

  expect(seed).toHaveBeenCalledTimes(2);
});

test('it seeds again on a new probe token', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve(true));

  const poll = startDefinitionsPoll({
    probe: mock(() => Promise.resolve('rev-2')).mockResolvedValueOnce('rev-1'),
    seed,
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(seed).toHaveBeenCalledTimes(2);
});

test('it reports every probe, one whose token it seeded already included', async () => {
  const ctx = setupTest();
  const onProbed = mock<(probed: DefinitionsProbe) => void>();

  const poll = startDefinitionsPoll({
    probe: () => Promise.resolve('rev-1'),
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed,
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(onProbed.mock.calls).toStrictEqual([[{ isChanged: true }], [{ isChanged: false }]]);
});

test('it reports no probe for a probe that throws', async () => {
  const ctx = setupTest();
  const onProbed = mock<(probed: DefinitionsProbe) => void>();

  const poll = startDefinitionsPoll({
    probe: () => Promise.reject(new Error('the definitions directory is gone')),
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed,
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(onProbed).not.toHaveBeenCalled();
});

test('it reports a probe that throws and keeps polling', async () => {
  const ctx = setupTest();
  const onError = mock<(error: unknown) => void>();

  const poll = startDefinitionsPoll({
    probe: () => Promise.reject(new Error('the definitions directory is gone')),
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
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

test('it probes nothing before the retry delay passes when the seed at start was refused', () => {
  const ctx = setupTest();
  const probe = mock(() => Promise.resolve('rev-1'));

  const poll = startDefinitionsPoll({
    probe,
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 300_000,
    retryDelayMs: 1000,
    isRefusedAtStart: true,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(999);

  expect(probe).not.toHaveBeenCalled();
});

test('it seeds once the retry delay passes when the seed at start was refused', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve(true));

  const poll = startDefinitionsPoll({
    probe: () => Promise.resolve('rev-1'),
    seed,
    clock: ctx.clock,
    intervalMs: 300_000,
    retryDelayMs: 1000,
    isRefusedAtStart: true,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(1000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(seed).toHaveBeenCalledOnce();
});

test('it seeds a checkout that lands after a failed probe, 2 s after that probe', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve(true));

  const poll = startDefinitionsPoll({
    probe: mock(() => Promise.resolve('rev-1')).mockRejectedValueOnce(
      new Error('the definitions directory is missing'),
    ),
    seed,
    clock: ctx.clock,
    intervalMs: 300_000,
    retryDelayMs: 1000,
    isRefusedAtStart: true,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(1000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(2000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(seed).toHaveBeenCalledOnce();
});

test('it waits 4 s before the probe after 2 failed probes', async () => {
  const ctx = setupTest();
  const probe = mock(() => Promise.reject(new Error('the definitions directory is missing')));

  const poll = startDefinitionsPoll({
    probe,
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 300_000,
    retryDelayMs: 1000,
    isRefusedAtStart: true,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(1000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(2000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(3999);

  expect(probe).toHaveBeenCalledTimes(2);
});

test('it waits no longer than the interval between failed probes', async () => {
  const ctx = setupTest();
  const probe = mock(() => Promise.reject(new Error('the definitions directory is missing')));

  const poll = startDefinitionsPoll({
    probe,
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 1500,
    retryDelayMs: 1000,
    isRefusedAtStart: true,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(1000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(1500);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(probe).toHaveBeenCalledTimes(2);
});

test('it seeds the same probe token again after the retry delay when a seed is refused', async () => {
  const ctx = setupTest();
  const seed = mock(() => Promise.resolve(true)).mockResolvedValueOnce(false);

  const poll = startDefinitionsPoll({
    probe: () => Promise.resolve('rev-1'),
    seed,
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(1000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  expect(seed).toHaveBeenCalledTimes(2);
});

test('it seeds the last good probe token again when the source returns to it after a refused seed', async () => {
  const ctx = setupTest();

  const seed = mock(() => Promise.resolve(true))
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);

  const poll = startDefinitionsPoll({
    probe: mock(() => Promise.resolve('rev-1'))
      .mockResolvedValueOnce('rev-1')
      .mockResolvedValueOnce('rev-2'),
    seed,
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(60_000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(1000);

  await expect(waitForCondition(() => seed.mock.calls.length === 3)).toResolve();
});

test('it probes after an interval shorter than the retry delay when the seed at start was refused', async () => {
  const ctx = setupTest();
  const probe = mock(() => Promise.resolve('rev-1'));

  const poll = startDefinitionsPoll({
    probe,
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 100,
    retryDelayMs: 1000,
    isRefusedAtStart: true,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(100);

  await expect(waitForCondition(() => probe.mock.calls.length === 1)).toResolve();
});

test('it probes again after an interval shorter than the retry delay when a probe fails', async () => {
  const ctx = setupTest();
  const probe = mock(() => Promise.reject(new Error('the definitions directory is missing')));

  const poll = startDefinitionsPoll({
    probe,
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 100,
    retryDelayMs: 1000,
    isRefusedAtStart: false,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(100);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(100);

  await expect(waitForCondition(() => probe.mock.calls.length === 2)).toResolve();
});

test('it waits the interval again once a retried seed applies', async () => {
  const ctx = setupTest();
  const probe = mock(() => Promise.resolve('rev-1'));

  const poll = startDefinitionsPoll({
    probe,
    seed: () => Promise.resolve(true),
    clock: ctx.clock,
    intervalMs: 60_000,
    retryDelayMs: 1000,
    isRefusedAtStart: true,
    onProbed: () => {},
    onError: () => {},
  });

  onTestFinished(() => poll.stop());

  ctx.clock.advance(1000);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(59_999);

  expect(probe).toHaveBeenCalledOnce();
});
