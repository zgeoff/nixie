import { expect, test } from 'bun:test';
import { makeGatedCall } from '@heynixie/testing';
import { makeDeliveryLock } from './make-delivery-lock';

test('it runs one callback at a time, in the order they arrive', async () => {
  const lock = makeDeliveryLock();
  const gated = makeGatedCall((label: string) => label);

  const runs = Promise.all([
    lock(() => gated.call('first')),
    lock(() => gated.call('second')),
    lock(() => gated.call('third')),
  ]);

  await gated.started;

  gated.release();

  const result = await runs;

  expect(result).toStrictEqual(['first', 'second', 'third']);
  expect(gated.countMostRunning()).toBe(1);
});

test('it runs the next callback after one rejects', async () => {
  const lock = makeDeliveryLock();
  const failed = lock(() => Promise.reject(new Error('the write failed')));
  const next = lock(() => Promise.resolve('next ran'));

  expect(failed).rejects.toThrowWithMessage(Error, 'the write failed');

  const result = await next;

  expect(result).toBe('next ran');
});
