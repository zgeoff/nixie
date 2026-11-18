import { expect, test } from 'bun:test';
import { buildTestIDToken } from '../test-utils/build-test-id-token';
import { buildTestJWT } from '../test-utils/build-test-jwt';
import { parseIDToken } from './parse-id-token';
import { parseTokenExpiry } from './parse-token-expiry';

test('it reads the account, plan and email of an ID token', () => {
  expect(
    parseIDToken(
      buildTestIDToken({ accountID: 'acct-test-9', planType: 'pro', email: 'a@example.com' }),
    ),
  ).toStrictEqual({ accountID: 'acct-test-9', planType: 'pro', email: 'a@example.com' });
});

test.each([
  ['a token with no auth claim', buildTestJWT({ email: 'a@example.com' })],
  [
    'a token with no email',
    buildTestJWT({
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'acct-test-1',
        chatgpt_plan_type: 'plus',
      },
    }),
  ],
  ['text that is no token', 'not-a-token'],
  ['a payload that is no JSON', 'a.bm90LWpzb24.c'],
])('it reads %s as no identity', (_name, token) => {
  expect(parseIDToken(token)).toBeNull();
});

test('it reads the exp claim of an access token in milliseconds', () => {
  expect(parseTokenExpiry(buildTestJWT({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
});

test.each([buildTestJWT({}), buildTestJWT({ exp: 'soon' }), 'opaque-token'])(
  'it reads %s as no expiry',
  (token) => {
    expect(parseTokenExpiry(token)).toBeNull();
  },
);
