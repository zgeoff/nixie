import { expect, test } from 'bun:test';
import { pickReachedAtMs } from './pick-reached-at-ms';

test.each([
  { status: 'expiring', expected: 1_000_000 - 3 * 86_400_000 },
  { status: 'needs_consent', expected: 1_000_000 },
] as const)('it dates a connection that reached $status from the end of its grant', (row) => {
  expect(pickReachedAtMs(row.status, 1_000_000)).toBe(row.expected);
});
