import { expect, test } from 'bun:test';
import { waitForSettled } from './wait-for-settled';

test('it resolves once the work fulfils', async () => {
  await expect(waitForSettled(Promise.resolve('seeded'))).toResolve();
});

test('it resolves once the work rejects', async () => {
  const failed = Promise.reject(new Error('the seed failed'));

  await expect(waitForSettled(failed)).toResolve();
});

test('it stays pending until the work settles', async () => {
  const work = Promise.withResolvers<string>();
  const settled = waitForSettled(work.promise);
  const turn = Promise.withResolvers<'pending'>();

  // A macrotask runs after every queued microtask, so a settled wait wins the race first.
  setImmediate(() => {
    turn.resolve('pending');
  });

  const early = await Promise.race([settled, turn.promise]);

  work.resolve('seeded');

  await expect(settled).toResolve();

  expect(early).toBe('pending');
});

test('it resolves when there is no work to wait for', async () => {
  await expect(waitForSettled(null)).toResolve();
});
