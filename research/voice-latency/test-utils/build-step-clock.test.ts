import { expect, test } from 'bun:test';
import { buildStepClock } from './build-step-clock.ts';

test('it reads the time that the last sleep waited for', async () => {
  const clock = buildStepClock();
  await clock.sleepUntil(64);

  expect(clock.now()).toBe(64);
});

test('it keeps the time until the sleep ends', () => {
  const clock = buildStepClock();
  void clock.sleepUntil(64);

  expect(clock.now()).toBe(0);
});

test('it never moves back for a sleep that ends in the past', async () => {
  const clock = buildStepClock();
  await clock.sleepUntil(96);
  await clock.sleepUntil(32);

  expect(clock.now()).toBe(96);
});
