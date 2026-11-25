import { expect, test } from 'bun:test';
import { createKeyedLock } from './create-keyed-lock';

test('it runs the holders of one key one at a time, in the order they asked', async () => {
  const lock = createKeyedLock();
  const order: string[] = [];
  const gate = Promise.withResolvers<void>();

  const first = lock.withLock('credential', async () => {
    order.push('first started');

    await gate.promise;

    order.push('first done');
  });

  const second = lock.withLock('credential', () => {
    order.push('second started');

    return Promise.resolve();
  });

  await Promise.resolve();

  gate.resolve();

  await Promise.all([first, second]);

  expect(order).toStrictEqual(['first started', 'first done', 'second started']);
});

test('it lets the holders of different keys run at the same time', async () => {
  const lock = createKeyedLock();
  const gate = Promise.withResolvers<void>();
  const held = lock.withLock('credential-a', () => gate.promise);

  const other = await lock.withLock('credential-b', () => Promise.resolve('ran'));

  gate.resolve();

  await held;

  expect(other).toBe('ran');
});

test('it lets the next holder run after a holder throws', async () => {
  const lock = createKeyedLock();
  const failing = lock.withLock('credential', () => Promise.reject(new Error('refused')));
  const next = lock.withLock('credential', () => Promise.resolve('ran'));

  await Promise.allSettled([failing, next]);

  expect(failing).rejects.toThrow('refused');
  expect(next).resolves.toBe('ran');
});
