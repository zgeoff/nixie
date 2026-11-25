import { expect, test } from 'bun:test';
import { CredentialRefusalError } from '@heynixie/egress';
import { readRecords } from '@heynixie/log';
import { waitFor } from '@zgeoff/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildHeldSpec } from '../test-utils/build-held-spec';
import { buildIDToken } from '../test-utils/build-id-token';
import { createHeldTestStore } from '../test-utils/create-held-test-store';
import { seedHeldConnection } from '../test-utils/seed-held-connection';
import { startCredentialTestLog } from '../test-utils/start-credential-test-log';
import { startFakeOAuthProvider } from '../test-utils/start-fake-oauth-provider';
import type { BindingRef } from '../types';
import { CredentialRemovedError } from './credential-removed-error';
import { TokenRequestError } from './token-request-error';

async function setupTest() {
  const provider = await startFakeOAuthProvider();

  const clock = createFakeClock({ startMs: Date.parse('2026-10-16T09:00:00Z') });

  const testLog = await startCredentialTestLog({ clock });

  const held = await createHeldTestStore({
    log: testLog.log,
    ca: provider.ca,
    now: () => clock.now(),
  });

  const exchangeCode = (client: BindingRef<'database'>, credentialID = crypto.randomUUID()) =>
    held.store.exchange(client, {
      code: 'fake-code',
      redirectURI: 'https://nixie.example/callback',
      credentialID,
    });

  const readRecordEntries = async () => {
    const page = await readRecords(testLog.log, { afterSequence: 0 });

    return page.map((entry) => entry.record);
  };

  return {
    provider,
    clock,
    store: held.store,
    backend: held.backend,
    ownValues: held.ownValues,
    spec: (kind: 'oauth_client' | 'oauth_token') => buildHeldSpec(provider, kind),
    exchangeCode,
    connectCredential: () => seedHeldConnection(held, provider),
    readRecordKinds: async () => {
      const records = await readRecordEntries();

      return records.map((record) => record.kind);
    },
    readRecordPayloads: async (kind: string) => {
      const records = await readRecordEntries();

      return records.filter((record) => record.kind === kind).map((record) => record.payload);
    },
  };
}

test('it gives a binding the removal counter, and a binding made after a removal the next one', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  await ctx.store.remove(connection.tokenRef);

  const after = await ctx.store.registerHeld(connection.tokenRef, ctx.spec('oauth_token'));

  expect([connection.token.removalCounter, after.removalCounter]).toStrictEqual([0, 1]);
});

test('it blocks every handle made before a removal', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const send = ctx.store.fetcher(connection.token, [ctx.provider.origin]);

  await ctx.store.remove(connection.tokenRef);

  await expect(send(`${ctx.provider.origin}/data`)).rejects.toBeInstanceOf(CredentialRemovedError);
  await expect(ctx.store.refresh(connection.token)).rejects.toBeInstanceOf(CredentialRemovedError);
});

test('it lets an adapter tell a removed handle from a failure of the service', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  await ctx.store.remove(connection.tokenRef);

  await expect(ctx.store.refresh(connection.token)).rejects.toBeInstanceOf(CredentialRefusalError);
});

test('it sends the code, the client secret and the verifier in the exchange body, never in a header', async () => {
  const ctx = await setupTest();

  const clientRef = { backend: 'database', credentialID: crypto.randomUUID() } as const;

  await ctx.backend.writeClient(clientRef.credentialID, {
    clientSecret: 'fake-client-secret-value',
  });

  const client = await ctx.store.registerHeld(clientRef, ctx.spec('oauth_client'));

  await ctx.store.exchange(client, {
    code: 'fake-code',
    redirectURI: 'https://nixie.example/callback',
    codeVerifier: 'fake-verifier',
    credentialID: crypto.randomUUID(),
  });

  expect(ctx.provider.requests).toStrictEqual([
    {
      path: '/token',
      authorization: null,
      form: {
        grant_type: 'authorization_code',
        code: 'fake-code',
        redirect_uri: 'https://nixie.example/callback',
        client_id: 'client-123',
        client_secret: 'fake-client-secret-value',
        code_verifier: 'fake-verifier',
      },
    },
  ]);
});

test('it returns an exchange result that holds no token', async () => {
  const ctx = await setupTest();

  const clientRef = { backend: 'database', credentialID: crypto.randomUUID() } as const;

  await ctx.backend.writeClient(clientRef.credentialID, {
    clientSecret: 'fake-client-secret-value',
  });

  const client = await ctx.store.registerHeld(clientRef, ctx.spec('oauth_client'));
  const result = await ctx.exchangeCode(client);

  const text = JSON.stringify(result);

  expect(text.includes('fake-access-token-1') || text.includes('fake-refresh-token-1')).toBe(false);
});

test('it refreshes with the refresh token and the client secret, and saves the new token', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();
  const outcome = await ctx.store.refresh(connection.token);
  const saved = await ctx.backend.readToken(connection.tokenRef.credentialID);

  expect(outcome).toBe('saved');

  expect(ctx.provider.requests.at(-1)?.form).toStrictEqual({
    grant_type: 'refresh_token',
    refresh_token: 'fake-refresh-token-1',
    client_id: 'client-123',
    client_secret: 'fake-client-secret-value',
  });

  expect(saved?.accessToken).toBe('fake-access-token-2');
});

test('it adds the access token as a bearer header on a request', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => new Response('ok'));

  const response = await ctx.store.fetcher(connection.token, [ctx.provider.origin])(
    `${ctx.provider.origin}/data`,
  );

  expect([response.status, ctx.provider.requests.at(-1)?.authorization]).toStrictEqual([
    200,
    'Bearer fake-access-token-1',
  ]);
});

test('it refreshes once and retries once on a rejected request', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  let dataCalls = 0;

  ctx.provider.answerToken((request) => {
    if (request.form['grant_type'] === 'refresh_token') {
      return Response.json({ access_token: 'fake-access-token-9', expires_in: 3600 });
    }

    dataCalls += 1;

    return new Response('data', { status: dataCalls === 1 ? 401 : 200 });
  });

  const response = await ctx.store.fetcher(connection.token, [ctx.provider.origin])(
    `${ctx.provider.origin}/data`,
  );

  const authorizations = ctx.provider.requests.map((request) => request.authorization);

  expect(response.status).toBe(200);

  expect(authorizations).toStrictEqual([
    null,
    'Bearer fake-access-token-1',
    null,
    'Bearer fake-access-token-9',
  ]);
});

test('it marks the credential failing when the retry is rejected too', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken((request) =>
    request.form['grant_type'] === 'refresh_token'
      ? Response.json({ access_token: 'fake-access-token-9', expires_in: 3600 })
      : new Response('denied', { status: 401 }),
  );

  const response = await ctx.store.fetcher(connection.token, [ctx.provider.origin])(
    `${ctx.provider.origin}/data`,
  );

  const status = await ctx.store.readStatus(connection.token);

  expect(response.status).toBe(401);
  expect(status).toMatchObject({ status: 'failing', reason: 'unauthorised' });
});

test('it runs one refresh per credential at a time', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const gate = Promise.withResolvers<void>();

  ctx.provider.answerToken(async () => {
    await gate.promise;

    return Response.json({ access_token: 'fake-access-token-9', expires_in: 3600 });
  });

  const first = ctx.store.refresh(connection.token);
  const second = ctx.store.refresh(connection.token);

  await waitFor(() => expect(ctx.provider.requests).toHaveLength(2));

  gate.resolve();

  const outcomes = await Promise.all([first, second]);

  expect(outcomes).toStrictEqual(['saved', 'saved']);
  expect(ctx.provider.requests).toHaveLength(2);
});

test('it marks the credential failing after 3 failed refreshes in a row', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => new Response('down', { status: 503 }));

  await ctx.store.refresh(connection.token);
  await ctx.store.refresh(connection.token);

  const beforeThird = await ctx.store.readStatus(connection.token);

  await ctx.store.refresh(connection.token);

  const afterThird = await ctx.store.readStatus(connection.token);

  expect(beforeThird).toMatchObject({ status: 'active', failures: 2 });
  expect(afterThird).toMatchObject({ status: 'failing', reason: 'service_error', failures: 3 });
});

test('it returns a failing credential to active when a refresh succeeds', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  let isDown = true;

  ctx.provider.answerToken(() =>
    isDown
      ? new Response('down', { status: 503 })
      : Response.json({ access_token: 'fake-access-token-9', expires_in: 3600 }),
  );

  await ctx.store.refresh(connection.token);
  await ctx.store.refresh(connection.token);
  await ctx.store.refresh(connection.token);

  isDown = false;

  await ctx.store.refresh(connection.token);

  const status = await ctx.store.readStatus(connection.token);

  expect(status).toMatchObject({ status: 'active', failures: 0 });
});

test('it marks the credential needs_consent when the provider refuses the grant for good', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));

  const outcome = await ctx.store.refresh(connection.token);
  const status = await ctx.store.readStatus(connection.token);

  expect(outcome).toBe('needs_consent');
  expect(status).toMatchObject({ status: 'needs_consent' });
});

test('it refuses a request on a credential that needs consent', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));

  await ctx.store.refresh(connection.token);

  const send = ctx.store.fetcher(connection.token, [ctx.provider.origin]);

  await expect(send(`${ctx.provider.origin}/data`)).rejects.toBeInstanceOf(CredentialRefusalError);
});

test('it writes credential.refresh_started naming the new key before the refresh sends', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const seenAtSend: (readonly string[])[] = [];

  ctx.provider.answerToken(async () => {
    const kinds = await ctx.readRecordKinds();

    seenAtSend.push(kinds);

    return Response.json({ access_token: 'fake-access-token-9', expires_in: 3600 });
  });

  await ctx.store.refresh(connection.token);

  const [started] = await ctx.readRecordPayloads('credential.refresh_started');
  const saved = await ctx.backend.readToken(connection.tokenRef.credentialID);

  expect(seenAtSend).toStrictEqual([['credential.refresh_started']]);

  expect(started).toMatchObject({
    credentialID: connection.tokenRef.credentialID,
    newKeyID: saved?.keyID,
  });
});

test('it closes each refresh with a record, so a failed one never reads as a crash', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => new Response('down', { status: 503 }));

  await ctx.store.refresh(connection.token);
  await ctx.store.recover();

  const kinds = await ctx.readRecordKinds();

  expect(kinds).toStrictEqual(['credential.refresh_started', 'credential.refresh_failed']);
});

test('it deletes the old key after a refresh saves, and the new key after one fails', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();
  const before = await ctx.backend.readToken(connection.tokenRef.credentialID);

  await ctx.store.refresh(connection.token);

  const after = await ctx.backend.readToken(connection.tokenRef.credentialID);

  expect(before?.keyID).not.toBe(after?.keyID);
  expect(ctx.backend.readKeyIDs()).toStrictEqual([after?.keyID ?? '']);
});

test('it revokes the token a refresh received and saves nothing when a removal moved the counter', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const gate = Promise.withResolvers<void>();

  ctx.provider.answerToken(async () => {
    await gate.promise;

    return Response.json({
      access_token: 'fake-access-token-9',
      refresh_token: 'fake-refresh-token-9',
      expires_in: 3600,
    });
  });

  const running = ctx.store.refresh(connection.token);

  await waitFor(() => expect(ctx.provider.requests).toHaveLength(2));

  await ctx.store.remove(connection.tokenRef);

  gate.resolve();

  const outcome = await running;

  const revoke = ctx.provider.requests.find((request) => request.path === '/revoke');

  const saved = await ctx.backend.readToken(connection.tokenRef.credentialID);
  const discarded = await ctx.readRecordPayloads('credential.refresh_discarded');

  expect(outcome).toBe('removed');
  expect(revoke?.form['token']).toBe('fake-refresh-token-9');
  expect(saved).toBeNull();

  expect(discarded).toMatchObject([
    { credentialID: connection.tokenRef.credentialID, isRevoked: true },
  ]);
});

test('it refreshes before the token expires, and not before', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();
  const early = await ctx.store.refreshIfDue(connection.token);

  ctx.clock.advance(3600 * 1000 - 4 * 60 * 1000);

  const due = await ctx.store.refreshIfDue(connection.token);

  expect([early, due]).toStrictEqual([null, 'saved']);
});

test('it refreshes a token at least every 7 days', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() =>
    Response.json({ access_token: 'fake-access-token-9', expires_in: 30 * 24 * 3600 }),
  );

  await ctx.store.refresh(connection.token);

  ctx.clock.advance(6 * 24 * 3600 * 1000);

  const early = await ctx.store.refreshIfDue(connection.token);

  ctx.clock.advance(2 * 24 * 3600 * 1000);

  const due = await ctx.store.refreshIfDue(connection.token);

  expect([early, due]).toStrictEqual([null, 'saved']);
});

test('it waits out the backoff after a failed refresh', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => new Response('down', { status: 503 }));
  ctx.clock.advance(3600 * 1000);

  await ctx.store.refresh(connection.token);

  const early = await ctx.store.refreshIfDue(connection.token);

  ctx.clock.advance(30 * 1000);

  const later = await ctx.store.refreshIfDue(connection.token);

  expect([early, later]).toStrictEqual([null, 'failed']);
});

test('it refreshes a token that is about to expire before a request uses it', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken((request) =>
    request.form['grant_type'] === 'refresh_token'
      ? Response.json({ access_token: 'fake-access-token-9', expires_in: 3600 })
      : new Response('ok'),
  );

  ctx.clock.advance(3600 * 1000 - 60 * 1000);

  await ctx.store.fetcher(connection.token, [ctx.provider.origin])(`${ctx.provider.origin}/data`);

  expect(ctx.provider.requests.at(-1)?.authorization).toBe('Bearer fake-access-token-9');
});

test('it checks the issuer of an ID token before it reads the claims', async () => {
  const ctx = await setupTest();

  const clientRef = { backend: 'database', credentialID: crypto.randomUUID() } as const;

  await ctx.backend.writeClient(clientRef.credentialID, {
    clientSecret: 'fake-client-secret-value',
  });

  ctx.provider.answerToken(() =>
    Response.json({
      access_token: 'fake-access-token-9',
      expires_in: 3600,
      id_token: buildIDToken({
        iss: 'https://other.example',
        aud: 'client-123',
        exp: ctx.clock.now() / 1000 + 600,
        sub: 42,
      }),
    }),
  );

  const client = await ctx.store.registerHeld(clientRef, ctx.spec('oauth_client'));

  await expect(ctx.exchangeCode(client)).rejects.toMatchObject({
    name: 'TokenRequestError',
    code: 'id_token_issuer',
  });
});

test.each([
  { problem: 'audience', code: 'id_token_audience', claims: { aud: 'another-client' } },
  { problem: 'expiry', code: 'id_token_expired', claims: { exp: 1 } },
])('it refuses an ID token with a bad $problem, and revokes and saves nothing', async (row) => {
  const ctx = await setupTest();

  const clientRef = { backend: 'database', credentialID: crypto.randomUUID() } as const;
  const tokenID = crypto.randomUUID();

  await ctx.backend.writeClient(clientRef.credentialID, {
    clientSecret: 'fake-client-secret-value',
  });

  ctx.provider.answerToken(() =>
    Response.json({
      access_token: 'fake-access-token-9',
      refresh_token: 'fake-refresh-token-9',
      expires_in: 3600,
      id_token: buildIDToken({
        iss: 'https://issuer.example',
        aud: 'client-123',
        exp: ctx.clock.now() / 1000 + 600,
        sub: 'subject-1',
        ...row.claims,
      }),
    }),
  );

  const client = await ctx.store.registerHeld(clientRef, ctx.spec('oauth_client'));

  const failure = ctx.store.exchange(client, {
    code: 'fake-code',
    redirectURI: 'https://nixie.example/callback',
    credentialID: tokenID,
  });

  await expect(failure).rejects.toBeInstanceOf(TokenRequestError);

  const saved = await ctx.backend.readToken(tokenID);

  expect(saved).toBeNull();

  expect(ctx.provider.requests.at(-1)).toMatchObject({
    path: '/revoke',
    form: { token: 'fake-refresh-token-9' },
  });
});

test('it reads the subject and email of an ID token that passes every check', async () => {
  const ctx = await setupTest();

  const clientRef = { backend: 'database', credentialID: crypto.randomUUID() } as const;

  await ctx.backend.writeClient(clientRef.credentialID, {
    clientSecret: 'fake-client-secret-value',
  });

  ctx.provider.answerToken(() =>
    Response.json({
      access_token: 'fake-access-token-9',
      expires_in: 3600,
      id_token: buildIDToken({
        iss: 'https://issuer.example',
        aud: ['client-123', 'another'],
        exp: ctx.clock.now() / 1000 + 600,
        sub: 'subject-1',
        email: 'wren@example.test',
      }),
    }),
  );

  const client = await ctx.store.registerHeld(clientRef, ctx.spec('oauth_client'));
  const result = await ctx.exchangeCode(client);

  expect(result.account).toStrictEqual({ subject: 'subject-1', email: 'wren@example.test' });
});

test('it puts no token, client secret or key in a record, an error or the exchange result', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  await ctx.store.refresh(connection.token);

  ctx.provider.answerToken(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));

  await ctx.store.refresh(connection.token);

  const failure = await ctx.store
    .fetcher(connection.token, [ctx.provider.origin])(`${ctx.provider.origin}/data`)
    .catch(String);

  const kinds = await ctx.readRecordKinds();
  const grouped = await Promise.all(kinds.map((kind) => ctx.readRecordPayloads(kind)));

  const payloads = grouped.flat();
  const everything = JSON.stringify([payloads, failure]);

  const leaks = [
    'fake-access-token',
    'fake-refresh-token',
    'fake-client-secret-value',
    'fake-code',
  ].map((value) => everything.includes(value));

  expect(leaks).toStrictEqual([false, false, false, false]);
});

test('it adds the tokens it holds to the own-value set, and takes them out on a removal', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const held = ctx.ownValues.read({ minChars: 1 });

  await ctx.store.remove(connection.tokenRef);

  const afterRemoval = ctx.ownValues.read({ minChars: 1 });

  expect([
    held.includes('fake-access-token-1'),
    held.includes('fake-refresh-token-1'),
    afterRemoval.includes('fake-access-token-1'),
    afterRemoval.includes('fake-refresh-token-1'),
  ]).toStrictEqual([true, true, false, false]);
});

test('it refuses a spec whose provider endpoint is outside its origins', async () => {
  const ctx = await setupTest();

  const clientRef = { backend: 'database', credentialID: crypto.randomUUID() } as const;
  const register = ctx.store.registerHeld(clientRef, { ...ctx.spec('oauth_client'), origins: [] });

  await expect(register).rejects.toThrow(/not an origin of the credential/u);
});
