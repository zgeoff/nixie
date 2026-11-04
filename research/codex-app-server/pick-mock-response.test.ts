import { expect, test } from 'bun:test';
import { pickMockResponse } from './pick-mock-response.ts';

test('it streams a reply to a model request when no failure remains', () => {
  expect(pickMockResponse({ path: '/backend-api/codex/responses', body: '{}', failures: 0 })).toStrictEqual({
    status: 200,
    reply: 'stream',
    grantType: null,
    failuresLeft: 0,
  });
});

test('it answers the workspace list with the accounts', () => {
  expect(
    pickMockResponse({ path: '/backend-api/wham/accounts/check', body: '', failures: 1 }),
  ).toStrictEqual({ status: 200, reply: 'accounts', grantType: null, failuresLeft: 1 });
});

test('it refuses a model request with 401 and spends one failure', () => {
  expect(pickMockResponse({ path: '/backend-api/codex/responses', body: '{}', failures: 2 })).toStrictEqual({
    status: 401,
    reply: 'error',
    grantType: null,
    failuresLeft: 1,
  });
});

test.each([
  { body: '{"grant_type":"refresh_token","refresh_token":"placeholder"}', grantType: 'refresh_token' },
  { body: 'grant_type=refresh_token&refresh_token=placeholder', grantType: 'refresh_token' },
  { body: '{"refresh_token":"placeholder"}', grantType: null },
  { body: '', grantType: null },
])('it refuses a refresh grant with 401 and reads the grant type from $body', ({ body, grantType }) => {
  expect(pickMockResponse({ path: '/oauth/token', body, failures: 1 })).toStrictEqual({
    status: 401,
    reply: 'error',
    grantType,
    failuresLeft: 1,
  });
});

test.each([
  { path: '/oauth/token/' },
  { path: '/backend-api/codex/models' },
  { path: '/backend-api/codex/responses/extra' },
  { path: '/' },
  { path: '' },
])('it refuses $path with 404', ({ path }) => {
  expect(pickMockResponse({ path, body: '', failures: 1 })).toStrictEqual({
    status: 404,
    reply: 'error',
    grantType: null,
    failuresLeft: 1,
  });
});
