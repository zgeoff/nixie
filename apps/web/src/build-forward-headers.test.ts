import { expect, test } from 'bun:test';
import { buildForwardHeaders } from './build-forward-headers';

test('it forwards the device session as a bearer token', () => {
  expect(buildForwardHeaders('s3ss10n-t0ken')).toStrictEqual({
    authorization: 'Bearer s3ss10n-t0ken',
    'x-nixie-client': 'web',
  });
});

test.each([
  ['no cookie', undefined],
  ['an empty cookie', ''],
])('it sends no credential for %s', (_label, sessionToken) => {
  expect(buildForwardHeaders(sessionToken)).toStrictEqual({ 'x-nixie-client': 'web' });
});
