import { expect, test } from 'bun:test';
import { createLane } from './create-lane';

test('it starts each task after the one before it ends', async () => {
  const lane = createLane();
  const events: string[] = [];
  const gate = Promise.withResolvers<void>();

  const first = lane.run(async () => {
    events.push('first start');

    await gate.promise;

    events.push('first end');
  });

  const second = lane.run(() => {
    events.push('second start');

    return Promise.resolve();
  });

  gate.resolve();

  await Promise.all([first, second]);

  expect(events).toStrictEqual(['first start', 'first end', 'second start']);
});

test('it runs the next task after a task fails', async () => {
  const lane = createLane();
  const failed = lane.run(() => Promise.reject(new Error('a fault')));
  const next = lane.run(() => Promise.resolve('ran'));

  await Promise.allSettled([failed]);

  expect(failed).rejects.toThrow('a fault');
  expect(next).resolves.toBe('ran');
});
