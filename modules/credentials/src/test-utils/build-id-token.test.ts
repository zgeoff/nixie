import { expect, test } from 'bun:test';
import { buildIDToken } from './build-id-token';

test('it builds a token whose payload holds the claims', () => {
  const payload = buildIDToken({ sub: 'subject-1' }).split('.')[1] ?? '';

  expect(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))).toStrictEqual({
    sub: 'subject-1',
  });
});
