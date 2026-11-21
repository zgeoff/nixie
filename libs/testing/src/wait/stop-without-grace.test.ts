import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { stopWithoutGrace } from './stop-without-grace';

test('it ends a stop that waits on a grace sleep of no time', async () => {
  const clock = createFakeClock({ startMs: 1000 });

  await stopWithoutGrace(clock, { stop: (graceMs) => clock.sleep(graceMs) });

  expect(clock.now()).toBe(1000);
  expect(clock.countPending()).toBe(0);
});

test('it passes a grace of 0 to the stop', async () => {
  const clock = createFakeClock();
  const graces: number[] = [];

  await stopWithoutGrace(clock, {
    stop: (graceMs) => {
      graces.push(graceMs);

      return Promise.resolve();
    },
  });

  expect(graces).toStrictEqual([0]);
});
