import { expect, test } from 'bun:test';
import { createCredentialFetcher } from '../fetch/create-credential-fetcher';
import { startFakeOAuthProvider } from './start-fake-oauth-provider';

async function setupTest() {
  const provider = await startFakeOAuthProvider();

  const send = createCredentialFetcher(
    {
      resolveHost: () => Promise.resolve(['127.0.0.1']),
      checkAddress: () => true,
      ca: provider.ca,
    },
    { spec: null, readValue: () => null, origins: [provider.origin], options: {} },
  );

  return { provider, send };
}

test('it answers each token request with a fresh token pair and records its form', async () => {
  const ctx = await setupTest();

  const first = await ctx.send(ctx.provider.tokenURL, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token' }),
  });

  const second = await ctx.send(ctx.provider.tokenURL, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token' }),
  });

  expect([await first.json(), await second.json()]).toStrictEqual([
    {
      access_token: 'fake-access-token-1',
      refresh_token: 'fake-refresh-token-1',
      expires_in: 3600,
    },
    {
      access_token: 'fake-access-token-2',
      refresh_token: 'fake-refresh-token-2',
      expires_in: 3600,
    },
  ]);

  expect(ctx.provider.requests.map((request) => request.form)).toStrictEqual([
    { grant_type: 'refresh_token' },
    { grant_type: 'refresh_token' },
  ]);
});

test('it answers with what the test sets', async () => {
  const ctx = await setupTest();

  ctx.provider.answerToken(() => new Response('down', { status: 503 }));

  const response = await ctx.send(ctx.provider.tokenURL, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'refresh_token' }),
  });

  expect(response.status).toBe(503);
});

test('it records the host name each request asked for, and answers a second name it was given', async () => {
  const provider = await startFakeOAuthProvider({ otherNames: ['other.test'] });

  const send = createCredentialFetcher(
    {
      resolveHost: () => Promise.resolve(['127.0.0.1']),
      checkAddress: () => true,
      ca: provider.ca,
    },
    {
      spec: null,
      readValue: () => null,
      origins: [provider.origin, provider.origin.replace('auth.test', 'other.test')],
      options: {},
    },
  );

  await send(provider.tokenURL, { method: 'POST', body: new URLSearchParams({ field: 'value' }) });

  await send(provider.tokenURL.replace('auth.test', 'other.test'), {
    method: 'POST',
    body: new URLSearchParams({ field: 'value' }),
  });

  expect(provider.requests.map((request) => request.host)).toStrictEqual([
    'auth.test',
    'other.test',
  ]);
});
