import { expect, test } from 'bun:test';
import { buildPlaceholderJWT } from './build-placeholder-jwt';

function setupTest() {
  return {
    readSegments: (token: string) => {
      const [header = '', payload = '', signature = ''] = token.split('.');

      return {
        header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
        payload: JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
        signature,
      };
    },
  };
}

test('it builds an unsigned token that holds the account, the plan and an exp a day ahead', () => {
  const ctx = setupTest();
  const nowMs = Date.parse('2026-11-14T10:00:00.250Z');

  const segments = ctx.readSegments(
    buildPlaceholderJWT({ accountID: 'acct-test-1', planType: 'plus' }, nowMs),
  );

  expect(segments).toStrictEqual({
    header: { alg: 'none', typ: 'JWT' },
    payload: {
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'acct-test-1',
        chatgpt_plan_type: 'plus',
      },
      exp: Date.parse('2026-11-15T10:00:00Z') / 1000,
    },
    signature: 'placeholder',
  });
});

test('it holds no email in the token', () => {
  const token = buildPlaceholderJWT({ accountID: 'acct-test-1', planType: 'plus' }, 0);

  expect(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')).not.toContain(
    'email',
  );
});
