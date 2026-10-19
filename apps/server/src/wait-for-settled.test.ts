import { expect, test } from 'bun:test';
import { waitForSettled } from './wait-for-settled';

test('it resolves once the work fulfils', async () => {
  await expect(waitForSettled(Promise.resolve('seeded'))).toResolve();
});

test('it resolves once the work rejects', async () => {
  const failed = Promise.reject(new Error('the seed failed'));

  await expect(waitForSettled(failed)).toResolve();
});

test('it resolves when there is no work to wait for', async () => {
  await expect(waitForSettled(null)).toResolve();
});
