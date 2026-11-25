import { expect, test } from 'bun:test';
import { store } from '../mocks/store';
import { startStubAPI } from '../test-utils/start-stub-api';
import { handleMcpReturn } from './handle-mcp-return';

async function setupTest() {
  const api = startStubAPI();

  const session = await store.sessions.create({});

  return {
    api,
    cookie: `nixie_session=${session.token}`,
    token: session.token,
    handleReturn: (query: string, cookie: string | null) =>
      handleMcpReturn(
        api.url,
        new Request(`http://web.test/connections/mcp/return${query}`, {
          headers: cookie === null ? {} : { cookie },
        }),
      ),
  };
}

test('it forwards the session of the browser to the API as a bearer token', async () => {
  const ctx = await setupTest();

  await ctx.handleReturn('?state=abc&code=4%2F0Ab', ctx.cookie);

  expect(ctx.api.requests).toStrictEqual([
    {
      authorization: `Bearer ${ctx.token}`,
      cookie: null,
      path: '/rpc/mcp/finishSignIn',
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
    page.includes('SIGN_IN_NOT_FOUND'),
    page.includes('4/0Ab'),
  ]).toStrictEqual([400, 'no-store', 'no-referrer', true, false]);
});

test('it answers 400 with the error code when the browser has no session', async () => {
  const ctx = await setupTest();
  const response = await ctx.handleReturn('?state=abc&code=4%2F0Ab', null);
  const page = await response.text();

  expect([response.status, page.includes('UNAUTHORIZED')]).toStrictEqual([400, true]);
});

test('it answers 400 without calling the API when the state is missing', async () => {
  const ctx = await setupTest();
  const response = await ctx.handleReturn('?code=4%2F0Ab', ctx.cookie);

  expect([response.status, ctx.api.requests]).toStrictEqual([400, []]);
});
