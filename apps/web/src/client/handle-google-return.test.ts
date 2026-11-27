import { expect, test } from 'bun:test';
import { featureStore } from '../mocks/feature-store';
import { store } from '../mocks/store';
import { startStubAPI } from '../test-utils/start-stub-api';
import { handleGoogleReturn } from './handle-google-return';

async function setupTest() {
  const api = startStubAPI();

  const session = await store.sessions.create({});

  return {
    api,
    cookie: `nixie_session=${session.token}`,
    token: session.token,
    handleReturn: (query: string, cookie: string | null) =>
      handleGoogleReturn(
        api.url,
        new Request(`http://web.test/connections/google/return${query}`, {
          headers: cookie === null ? {} : { cookie },
        }),
      ),
  };
}

test('it forwards the session of the browser to the API as a bearer token', async () => {
  const ctx = await setupTest();

  await ctx.handleReturn('?state=abc&code=4%2F0Ab', ctx.cookie);

  expect(ctx.api.requests).toStrictEqual([
    { authorization: `Bearer ${ctx.token}`, cookie: null, path: '/rpc/nixie/read' },
    {
      authorization: `Bearer ${ctx.token}`,
      cookie: null,
      path: '/rpc/connections/finishConsent',
    },
  ]);
});

test('it answers a page with the error code when the API refuses, with no store and no referrer', async () => {
  const ctx = await setupTest();
  const response = await ctx.handleReturn('?state=abc&code=4%2F0Ab', ctx.cookie);
  const page = await response.text();

  expect([
    response.status,
    response.headers.get('cache-control'),
    response.headers.get('referrer-policy'),
    page.includes('CONSENT_NOT_FOUND'),
    page.includes('4/0Ab'),
  ]).toStrictEqual([400, 'no-store', 'no-referrer', true, false]);
});

test('it answers the feature-off page when the browser has no session, so a nixie with Google off never shows an error', async () => {
  const ctx = await setupTest();
  const response = await ctx.handleReturn('?state=abc&code=4%2F0Ab', null);
  const page = await response.text();

  expect([
    response.status,
    page.includes('This feature is off in this nixie'),
    ctx.api.requests.map((request) => request.path),
  ]).toStrictEqual([404, true, ['/rpc/nixie/read']]);
});

test.each([
  { session: 'no session', cookie: null },
  { session: 'a session that nixie refuses', cookie: 'nixie_session=unknown-token' },
])(
  'it answers the feature-off page, and never finishes a consent, when google is off and the browser has $session',
  async (row) => {
    const ctx = await setupTest();

    await featureStore.featuresOff.create({ feature: 'google' });

    const response = await ctx.handleReturn('?state=abc&code=4%2F0Ab', row.cookie);
    const page = await response.text();

    expect([
      response.status,
      page.includes('This feature is off in this nixie'),
      page.includes('4/0Ab'),
      ctx.api.requests.map((request) => request.path),
    ]).toStrictEqual([404, true, false, ['/rpc/nixie/read']]);
  },
);

test('it answers 400 without calling the API when the state is missing', async () => {
  const ctx = await setupTest();
  const response = await ctx.handleReturn('?code=4%2F0Ab', ctx.cookie);

  expect(response.status).toBe(400);
  expect(ctx.api.requests.map((request) => request.path)).toStrictEqual(['/rpc/nixie/read']);
});

test('it finishes the sign-in of an MCP server when the state carries the MCP prefix', async () => {
  const ctx = await setupTest();

  await ctx.handleReturn('?state=mcp.abc&code=4%2F0Ab&iss=https%3A%2F%2Fauth.example', ctx.cookie);

  expect(ctx.api.requests).toStrictEqual([
    {
      authorization: `Bearer ${ctx.token}`,
      cookie: null,
      path: '/rpc/mcp/finishSignIn',
    },
  ]);
});

test('it answers the feature-off page, and never finishes a consent, when google is off', async () => {
  const ctx = await setupTest();

  await featureStore.featuresOff.create({ feature: 'google' });

  const response = await ctx.handleReturn('?state=abc&code=4%2F0Ab', ctx.cookie);
  const page = await response.text();

  expect([
    response.status,
    page.includes('This feature is off in this nixie'),
    page.includes('4/0Ab'),
    ctx.api.requests.map((request) => request.path),
  ]).toStrictEqual([404, true, false, ['/rpc/nixie/read']]);
});
