import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { startFakeGoogleSite } from './start-fake-google-site';

test('it sends the browser back to the redirect URI with the state and a code', async () => {
  const site = startFakeGoogleSite();

  onTestFinished(() => site.stop());

  const authorize = new URL(`${site.url}/authorize`);

  authorize.searchParams.set('redirect_uri', 'http://127.0.0.1:4000/connections/google/return');
  authorize.searchParams.set('state', 'abc');

  const response = await fetch(authorize, { redirect: 'manual' });

  expect([response.status, response.headers.get('location')]).toStrictEqual([
    302,
    'http://127.0.0.1:4000/connections/google/return?state=abc&code=verify-code',
  ]);
});

test('it answers a code with a refresh token, every scope, and an ID token for the client', async () => {
  const site = startFakeGoogleSite();

  onTestFinished(() => site.stop());

  const response = await fetch(`${site.url}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: 'verify-code',
      client_id: 'client-1',
    }),
  });

  const tokenSchema = z.object({
    refresh_token: z.string(),
    id_token: z.string(),
    scope: z.string(),
  });

  const json: unknown = await response.json();

  const body = tokenSchema.parse(json);

  const claims: unknown = JSON.parse(
    Buffer.from(body.id_token.split('.')[1] ?? '', 'base64url').toString(),
  );

  expect([
    body.refresh_token.startsWith('verify-refresh-'),
    body.scope.split(' ').length,
    claims,
  ]).toMatchObject([true, 6, { aud: 'client-1', email: 'verify@example.test' }]);
});

test('it answers a read call of a scope with 200', async () => {
  const site = startFakeGoogleSite();

  onTestFinished(() => site.stop());

  const response = await fetch(`${site.url}/gmail/v1/users/me/labels`);

  expect(response.status).toBe(200);
});
