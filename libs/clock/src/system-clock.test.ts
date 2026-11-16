import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { systemClock } from './system-clock';

test('it reads the wall clock', () => {
  const before = Date.now();
  const now = systemClock.now();

  expect(now).toBeWithin(before, Date.now() + 1);
});

test('it ends a sleep at once when its signal aborts', async () => {
  const controller = new AbortController();

  const started = Date.now();
  const sleep = systemClock.sleep(60_000, controller.signal);

  controller.abort();

  await sleep;

  expect(Date.now() - started).toBeLessThan(1000);
});

test('it ends a sleep at once when its signal has already aborted', async () => {
  const started = Date.now();

  await systemClock.sleep(60_000, AbortSignal.abort());

  expect(Date.now() - started).toBeLessThan(1000);
});

test('it sleeps for the time it was given', async () => {
  const started = Date.now();

  await systemClock.sleep(20);

  expect(Date.now() - started).toBeGreaterThanOrEqual(19);
});

// The runtime prints its negative-timeout warning once a process, so the test reads the delay the
// timer gets, which holds whatever ran before it.
test('it sets a timer of no delay for a negative duration', async () => {
  const setTimer = spyOn(globalThis, 'setTimeout');

  onTestFinished(() => {
    setTimer.mockRestore();
  });

  await systemClock.sleep(-34);

  expect(setTimer.mock.calls.map((call) => call[1])).toStrictEqual([0]);
});
