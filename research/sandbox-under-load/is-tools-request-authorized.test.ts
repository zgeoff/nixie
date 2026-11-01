import { expect, test } from 'bun:test';
import { isToolsRequestAuthorized } from './is-tools-request-authorized';

test('it accepts the bearer header that carries the run token', () => {
  expect(isToolsRequestAuthorized('Bearer run-token-7f3a', 'run-token-7f3a')).toBeTrue();
});

test.each([
  ['a missing header', null, 'run-token-7f3a'],
  ['an empty header', '', 'run-token-7f3a'],
  ['the token with no scheme', 'run-token-7f3a', 'run-token-7f3a'],
  ['the scheme with no token', 'Bearer ', 'run-token-7f3a'],
  ['another scheme', 'Basic run-token-7f3a', 'run-token-7f3a'],
  ['a lowercase scheme', 'bearer run-token-7f3a', 'run-token-7f3a'],
  ['another token', 'Bearer run-token-0000', 'run-token-7f3a'],
  ['a prefix of the token', 'Bearer run-token-7f3', 'run-token-7f3a'],
  ['the token with a trailing space', 'Bearer run-token-7f3a ', 'run-token-7f3a'],
  ['an empty run token', 'Bearer ', ''],
])('it refuses %s', (_label, authorization, token) => {
  expect(isToolsRequestAuthorized(authorization, token)).toBeFalse();
});
