import { expect, test } from 'bun:test';
import { pickReadRefetchInterval } from './pick-read-refetch-interval';

test('it reads again on the interval while a call waits to run', () => {
  const data = {
    proposals: [{ call: null }, { call: { state: 'waiting', reason: null } }],
  } as const;

  expect(pickReadRefetchInterval(data, 15_000)).toBe(15_000);
});

test.each([
  { state: 'applied', reason: null },
  { state: 'failed', reason: 'the harbour office is closed' },
  { state: 'unknown', reason: null },
] as const)('it stops reading again once a call is $state', (call) => {
  expect(pickReadRefetchInterval({ proposals: [{ call }] }, 15_000)).toBe(false);
});

test('it does not read again before the first read arrives', () => {
  expect(pickReadRefetchInterval(undefined, 15_000)).toBe(false);
});
