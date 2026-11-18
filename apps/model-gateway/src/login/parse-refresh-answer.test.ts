import { expect, test } from 'bun:test';
import { parseRefreshAnswer } from './parse-refresh-answer';

test('it reads a 200 with both tokens as a token and the rotated refresh token', () => {
  expect(
    parseRefreshAnswer(200, {
      access_token: 'access-2',
      refresh_token: 'refresh-2',
      id_token: 'x',
    }),
  ).toStrictEqual({ kind: 'token', accessToken: 'access-2', refreshToken: 'refresh-2' });
});

test('it reads a 200 with no refresh token as a token that keeps the stored one', () => {
  expect(parseRefreshAnswer(200, { access_token: 'access-2' })).toStrictEqual({
    kind: 'token',
    accessToken: 'access-2',
    refreshToken: null,
  });
});

test.each([200, 204])('it reads a %i with no access token as a service error', (status) => {
  expect(parseRefreshAnswer(status, { refresh_token: 'refresh-2' })).toStrictEqual({
    kind: 'service_error',
  });
});

test.each([
  ['a string error', { error: 'refresh_token_expired' }, 'refresh_token_expired'],
  ['a string error', { error: 'refresh_token_reused' }, 'refresh_token_reused'],
  ['a string error', { error: 'refresh_token_invalidated' }, 'refresh_token_invalidated'],
  ['a string error', { error: 'invalid_grant' }, 'invalid_grant'],
  ['an error object', { error: { code: 'refresh_token_reused' } }, 'refresh_token_reused'],
])('it reads a 401 with %s as a refusal', (_name, body, code) => {
  expect(parseRefreshAnswer(401, body)).toStrictEqual({ kind: 'refused', code });
});

test.each([
  [401, { error: 'something_else' }],
  [400, { error: { code: 'unknown' } }],
  [400, null],
  [429, { error: 'invalid_grant' }],
  [500, { error: 'invalid_grant' }],
  [503, null],
])('it reads a %i answer of %j as a service error', (status, body) => {
  expect(parseRefreshAnswer(status, body)).toStrictEqual({ kind: 'service_error' });
});
