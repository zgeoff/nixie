import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { startFakeGoogleSite } from './start-fake-google-site';

test('it sends the browser back to the redirect URI with the state and a code', async () => {
  const site = await startFakeGoogleSite();

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
  const site = await startFakeGoogleSite();

  onTestFinished(() => site.stop());

  const response = await fetch(`${site.api.url}/token`, {
    method: 'POST',
    tls: { ca: site.api.ca },
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
  const site = await startFakeGoogleSite();

  onTestFinished(() => site.stop());

  const response = await fetch(`${site.api.url}/gmail/v1/users/me/labels`, {
    tls: { ca: site.api.ca },
  });

  expect(response.status).toBe(200);
});

test('it answers a Gmail search with the one mail in its mailbox', async () => {
  const site = await startFakeGoogleSite();

  onTestFinished(() => site.stop());

  const response = await fetch(`${site.api.url}/gmail/v1/users/me/messages?q=numbers`, {
    tls: { ca: site.api.ca },
  });

  const body: unknown = await response.json();

  expect(body).toStrictEqual({ messages: [expect.objectContaining({ id: expect.any(String) })] });
});

test('it keeps a mail that Gmail sends in the mailbox it hands back', async () => {
  const site = await startFakeGoogleSite();

  onTestFinished(() => site.stop());

  const raw = Buffer.from(
    'From: verify@example.test\r\nTo: sam@example.org\r\nSubject: Hi\r\nMessage-ID: <a@example.test>\r\n\r\nHello',
  ).toString('base64url');

  await fetch(`${site.api.url}/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    tls: { ca: site.api.ca },
    body: JSON.stringify({ raw }),
  });

  expect(site.gmail.sent).toHaveLength(1);
});
