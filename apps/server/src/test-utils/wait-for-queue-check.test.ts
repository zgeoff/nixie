import { expect, test } from 'bun:test';
import { waitForQueueCheck } from './wait-for-queue-check';

test('it waits for the queue check of the latest start, not an earlier one', async () => {
  const first = [
    { sequence: 1, kind: 'server.started', thread: null, stepKey: null, payload: {} },
    { sequence: 2, kind: 'action.outcome', thread: 'queue-check', stepKey: null, payload: {} },
    { sequence: 3, kind: 'server.started', thread: null, stepKey: null, payload: {} },
  ];

  const second = [
    ...first,
    { sequence: 4, kind: 'action.outcome', thread: 'queue-check', stepKey: null, payload: {} },
  ];

  const reads = [first, first, second];
  let readCount = 0;

  await waitForQueueCheck(() => {
    readCount += 1;

    return Promise.resolve(reads.shift() ?? second);
  }, 1000);

  expect(readCount).toBe(3);
});

test('it rejects when no queue check follows the latest start', () => {
  expect(
    waitForQueueCheck(
      () =>
        Promise.resolve([
          {
            sequence: 1,
            kind: 'action.outcome',
            thread: 'queue-check',
            stepKey: null,
            payload: {},
          },
          { sequence: 2, kind: 'server.started', thread: null, stepKey: null, payload: {} },
        ]),
      20,
    ),
  ).rejects.toThrowWithMessage(Error, 'condition not met within 20 ms');
});
