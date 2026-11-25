import { expect, test } from 'bun:test';
import { buildTestClient, createDeviceSession, startTestAPI } from '@heynixie/api/test-utils';
import { startGoogleConnections } from '@heynixie/connections/test-utils';
import { handleGoogleReturn } from '@heynixie/web/google-return';

async function setupTest() {
  const google = await startGoogleConnections();
  const api = await startTestAPI();

  api.setConnections(google.connections);

  const laptop = await createDeviceSession(api.context, 'laptop');
  const phone = await createDeviceSession(api.context, 'phone');

  const returnTo = (token: string, query: string) =>
    handleGoogleReturn(
      api.url,
      new Request(`https://nixie.example.org/connections/google/return${query}`, {
        headers: { cookie: `nixie_session=${token}` },
      }),
    );

  const startConsent = async (token: string) => {
    const client = buildTestClient(api.url, token, 'https://nixie.example.org');

    const started = await client.connections.startConsent({
      clientActionID: crypto.randomUUID(),
      connector: 'google',
      connection: null,
    });

    return new URL(started.consentURL).searchParams.get('state') ?? '';
  };

  return {
    ...google,
    api,
    laptop,
    phone,
    returnTo,
    startConsent,
    listConnections: () =>
      buildTestClient(api.url, laptop.token, 'https://nixie.example.org').connections.list(),
  };
}

test('it completes a consent against a fake Google, and takes the account from the ID token', async () => {
  const ctx = await setupTest();
  const state = await ctx.startConsent(ctx.laptop.token);

  const response = await ctx.returnTo(
    ctx.laptop.token,
    `?state=${state}&code=code-work&scope=ignored`,
  );

  const listed = await ctx.listConnections();

  expect([
    response.status,
    response.headers.get('location'),
    response.headers.get('cache-control'),
    response.headers.get('referrer-policy'),
    listed.map((connection) => [connection.account, connection.status, connection.missing]),
  ]).toStrictEqual([
    303,
    `/settings/connections/${listed[0]?.connection}`,
    'no-store',
    'no-referrer',
    [['work@example.test', 'active', []]],
  ]);
});

test('it sends the code, the client secret and a 43 character verifier to Google', async () => {
  const ctx = await setupTest();
  const state = await ctx.startConsent(ctx.laptop.token);

  await ctx.returnTo(ctx.laptop.token, `?state=${state}&code=code-work`);

  const [request] = ctx.google.codeRequests;

  expect([
    request?.['grant_type'],
    request?.['client_secret'],
    request?.['code_verifier']?.length,
  ]).toStrictEqual(['authorization_code', 'fake-client-secret-value', 43]);
});

test('it works once: a second return with the same state keeps no second connection', async () => {
  const ctx = await setupTest();
  const state = await ctx.startConsent(ctx.laptop.token);

  await ctx.returnTo(ctx.laptop.token, `?state=${state}&code=code-work`);

  const again = await ctx.returnTo(ctx.laptop.token, `?state=${state}&code=code-work`);
  const page = await again.text();
  const listed = await ctx.listConnections();

  expect([again.status, page.includes('CONSENT_NOT_FOUND'), listed.length]).toStrictEqual([
    400,
    true,
    1,
  ]);
});

test('it binds the state to the session that started it, and keeps it for that session', async () => {
  const ctx = await setupTest();
  const state = await ctx.startConsent(ctx.laptop.token);
  const stolen = await ctx.returnTo(ctx.phone.token, `?state=${state}&code=code-work`);
  const stolenPage = await stolen.text();
  const own = await ctx.returnTo(ctx.laptop.token, `?state=${state}&code=code-work`);

  expect([stolen.status, stolenPage.includes('CONSENT_NOT_FOUND'), own.status]).toStrictEqual([
    400,
    true,
    303,
  ]);
});

test('it keeps nothing when the token response has no refresh token', async () => {
  const ctx = await setupTest();

  ctx.google.accounts.set('code-grant-before', {
    sub: 'sub-before',
    email: 'before@example.test',
    scopes: ['gmail.modify'],
    hasRefreshToken: false,
  });

  const state = await ctx.startConsent(ctx.laptop.token);
  const response = await ctx.returnTo(ctx.laptop.token, `?state=${state}&code=code-grant-before`);
  const page = await response.text();
  const listed = await ctx.listConnections();

  expect([response.status, page.includes('NO_REFRESH_TOKEN'), listed]).toStrictEqual([
    400,
    true,
    [],
  ]);
});

test('it shows the error code of Google when Google refuses the code', async () => {
  const ctx = await setupTest();
  const state = await ctx.startConsent(ctx.laptop.token);
  const response = await ctx.returnTo(ctx.laptop.token, `?state=${state}&code=code-unknown`);
  const page = await response.text();

  expect([
    response.status,
    page.includes('TOKEN_EXCHANGE_FAILED'),
    page.includes('invalid_grant'),
  ]).toStrictEqual([400, true, true]);
});

test('it answers a refused consent with its error code and keeps nothing', async () => {
  const ctx = await setupTest();
  const state = await ctx.startConsent(ctx.laptop.token);
  const response = await ctx.returnTo(ctx.laptop.token, `?state=${state}&error=access_denied`);
  const page = await response.text();
  const listed = await ctx.listConnections();

  expect([response.status, page.includes('CONSENT_REFUSED'), listed]).toStrictEqual([
    400,
    true,
    [],
  ]);
});
