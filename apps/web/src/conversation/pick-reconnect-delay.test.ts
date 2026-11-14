import { expect, test } from 'bun:test';
import { pickReconnectDelay } from './pick-reconnect-delay';

test.each([
  [0, 1000],
  [1, 1000],
  [2, 2000],
  [3, 4000],
  [4, 8000],
  [5, 16_000],
  [6, 30_000],
  [7, 30_000],
  [50, 30_000],
])('it waits, after %d failures in a row, %d ms', (failures, expected) => {
  expect(pickReconnectDelay(failures)).toBe(expected);
});
