import { expect, mock, test } from 'bun:test';
import { makeOpenReplies } from './make-open-replies';

test('it counts a reply once, and a later count of it adds nothing', async () => {
  const replies = makeOpenReplies();
  const atStop = mock(() => Promise.resolve());
  const count = mock(() => Promise.resolve());
  const countOnce = replies.open(atStop);

  await countOnce(count);
  await countOnce(count);

  await replies.countAtStop();

  expect([count.mock.calls.length, atStop.mock.calls.length]).toStrictEqual([1, 0]);
});

test('it counts each open reply at a stop, and a count after the stop adds nothing', async () => {
  const replies = makeOpenReplies();
  const atStopFirst = mock(() => Promise.resolve());
  const atStopSecond = mock(() => Promise.resolve());
  const lateCount = mock(() => Promise.resolve());
  const countFirst = replies.open(atStopFirst);

  replies.open(atStopSecond);

  await replies.countAtStop();

  await countFirst(lateCount);

  expect([
    atStopFirst.mock.calls.length,
    atStopSecond.mock.calls.length,
    lateCount.mock.calls.length,
  ]).toStrictEqual([1, 1, 0]);
});
