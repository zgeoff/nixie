import { expect, test } from 'bun:test';
import { readEvents } from './read-events';

test('it reads the next events and leaves the rest of the stream', async () => {
  const stream = [1, 2, 3][Symbol.iterator]();

  const asyncStream = {
    next: () => Promise.resolve(stream.next()),
  };

  const first = await readEvents(asyncStream, 2);
  const rest = await readEvents(asyncStream, 1);

  expect(first).toStrictEqual([1, 2]);
  expect(rest).toStrictEqual([3]);
});

test('it throws when the stream ends early', () => {
  const stream = [1][Symbol.iterator]();

  expect(readEvents({ next: () => Promise.resolve(stream.next()) }, 2)).rejects.toThrowWithMessage(
    Error,
    'the stream ended after 1 of 2 events',
  );
});
