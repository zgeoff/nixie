import { expect, test } from 'bun:test';
import { pickSendOutcome } from './pick-send-outcome.ts';

test.each([
  [201, false],
  [404, true],
  [410, true],
  [429, false],
  [500, false],
])('it keeps status %d and removes the subscription: %p', (status, removeSubscription) => {
  expect(pickSendOutcome({ kind: 'answered', status })).toStrictEqual({
    status,
    removeSubscription,
    failure: null,
  });
});

test('it answers a send with no answer as status 0 and keeps the subscription and the error', () => {
  const error = new Error('connection refused');

  expect(pickSendOutcome({ kind: 'failed', error })).toStrictEqual({
    status: 0,
    removeSubscription: false,
    failure: { error },
  });
});
