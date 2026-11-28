import { expect, test } from 'bun:test';
import { pickWatchIntervalMs } from './pick-watch-interval-ms';

test.each([
  { noticeMs: 2 * 24 * 60 * 60 * 1000, expected: 3_600_000 },
  { noticeMs: 600_000, expected: 150_000 },
  { noticeMs: 500, expected: 125 },
  { noticeMs: 2, expected: 1 },
])('it looks every $expected ms for a notice time of $noticeMs ms', (row) => {
  expect(pickWatchIntervalMs(row.noticeMs)).toBe(row.expected);
});
