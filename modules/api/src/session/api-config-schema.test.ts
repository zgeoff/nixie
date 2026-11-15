import { expect, test } from 'bun:test';
import { apiConfigSchema } from './api-config-schema';

test('it lists no read-only token hash by default', () => {
  expect(apiConfigSchema.parse({})).toStrictEqual({ readOnlyTokenHashes: [] });
});

test.each([
  ['a hash in capitals', 'A'.repeat(64)],
  ['a hash one character short', 'a'.repeat(63)],
  ['a token in place of its hash', 'a-read-only-token'],
])('it refuses %s', (_name, hash) => {
  expect(apiConfigSchema.safeParse({ read_only_token_hashes: [hash] }).success).toBeFalse();
});
