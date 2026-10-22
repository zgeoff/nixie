import { expect, mock, test } from 'bun:test';
import { makeKeyedQueue } from './make-keyed-queue';

test('it starts the next work on a key only once the work before it settles', async () => {
  const queue = makeKeyedQueue();
  const gate = Promise.withResolvers<string>();
  const second = mock(() => Promise.resolve('second'));
  const first = queue('tide-tables', () => gate.promise);
  const queued = queue('tide-tables', second);

  await queue('harbour-hours', () => Promise.resolve('other'));

  const callsWhileHeld = second.mock.calls.length;

  gate.resolve('first');

  expect(callsWhileHeld).toBe(0);
  expect(first).resolves.toBe('first');
  expect(queued).resolves.toBe('second');
});

test('it runs works on different keys at once', async () => {
  const queue = makeKeyedQueue();
  const gate = Promise.withResolvers<string>();
  const held = queue('tide-tables', () => gate.promise);

  const other = await queue('harbour-hours', () => Promise.resolve('other'));

  gate.resolve('first');

  expect(other).toBe('other');
  expect(held).resolves.toBe('first');
});

test('it starts the next work on a key after the work before it rejects', async () => {
  const queue = makeKeyedQueue();

  const failed = queue('tide-tables', () => {
    throw new Error('the write failed');
  });

  const next = await queue('tide-tables', () => Promise.resolve('next'));

  expect(failed).rejects.toThrowWithMessage(Error, 'the write failed');
  expect(next).toBe('next');
});
