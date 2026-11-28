import { expect, test } from 'bun:test';
import { pickModelCredentialExpiry } from './pick-model-credential-expiry';

function setupTest() {
  const day = 86_400_000;

  return {
    day,
    config: { expires_at: '2026-12-01T00:00:00Z', warn_before: 3 * day },
    expiresAtMs: Date.parse('2026-12-01T00:00:00Z'),
  };
}

test.each([
  { title: '4 days before', beforeDays: 4, isReported: false },
  { title: '3 days before', beforeDays: 3, isReported: true },
  { title: '1 day before', beforeDays: 1, isReported: true },
  { title: '1 day after', beforeDays: -1, isReported: true },
])('it reports the expiry $title it: $isReported', (row) => {
  const ctx = setupTest();
  const found = pickModelCredentialExpiry(ctx.config, ctx.expiresAtMs - row.beforeDays * ctx.day);
  const expected = row.isReported ? { expiresAtMs: ctx.expiresAtMs } : null;

  expect(found).toStrictEqual(expected);
});

test('it reports nothing for a deployment that names no expiry', () => {
  expect(pickModelCredentialExpiry(undefined, 0)).toBeNull();
});
