import { expect, test } from 'bun:test';
import { isKeyExpired } from './is-key-expired';

test.each([
  { title: 'before the provider drops the key', now: 1999, expected: false },
  { title: 'once the provider drops the key', now: 2000, expected: true },
])('#isKeyExpired returns $expected $title', (row) => {
  expect(
    isKeyExpired(
      { unknown_streak: 1, first_attempt_at: 1000 },
      { reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 1000 } },
      row.now,
    ),
  ).toBe(row.expected);
});

test('#isKeyExpired returns false for an action with no unknown outcome', () => {
  expect(
    isKeyExpired(
      { unknown_streak: 0, first_attempt_at: 1000 },
      { reconcile: { kind: 'idempotency_key', where: 'header', keptForMs: 1000 } },
      9000,
    ),
  ).toBe(false);
});

test('#isKeyExpired returns false for a connector that declares no key', () => {
  expect(isKeyExpired({ unknown_streak: 1, first_attempt_at: 1000 }, {}, 9000)).toBe(false);
});
