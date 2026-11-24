import { expect, test } from 'bun:test';
import { formatIdleTime } from './format-idle-time';

test.each([
  { idleMs: 30 * 60_000, expected: '30 minutes' },
  { idleMs: 60_000, expected: '1 minute' },
  { idleMs: 90_000, expected: '2 minutes' },
  { idleMs: 45_000, expected: '45 seconds' },
  { idleMs: 100, expected: '1 second' },
])('it formats $idleMs ms as $expected', (row) => {
  expect(formatIdleTime(row.idleMs)).toBe(row.expected);
});
