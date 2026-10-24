import { expect, test } from 'bun:test';
import { waitForReady } from './wait-for-ready.ts';

test('it gives no reason for a call that opens', async () => {
  expect(await waitForReady(Promise.resolve(), 1000)).toBeUndefined();
});

test('it gives the error of a call that fails to open', async () => {
  expect(await waitForReady(Promise.reject(new Error('grok: the socket failed')), 1000)).toBe(
    'Error: grok: the socket failed',
  );
});

test('it gives a timeout for a call that never opens', async () => {
  expect(await waitForReady(Promise.withResolvers<void>().promise, 10)).toBe('the call did not open within 10 ms');
});
