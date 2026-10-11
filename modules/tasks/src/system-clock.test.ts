import { expect, test } from 'bun:test';
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
