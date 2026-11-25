import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { CredentialRefusalError } from '@heynixie/egress';
import { readRecords } from '@heynixie/log';
import { waitFor } from '@zgeoff/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildHeldSpec } from '../test-utils/build-held-spec';
import { buildIDToken } from '../test-utils/build-id-token';
import { createHeldTestStore } from '../test-utils/create-held-test-store';
import { formatConsoleArgs } from '../test-utils/format-console-args';
import { seedHeldConnection } from '../test-utils/seed-held-connection';
import { startCredentialTestLog } from '../test-utils/start-credential-test-log';
import { startFakeOAuthProvider } from '../test-utils/start-fake-oauth-provider';
import type { BindingRef } from '../types';
import { CredentialRemovedError } from './credential-removed-error';

async function setupTest() {
  const provider = await startFakeOAuthProvider({ otherNames: ['other.test'] });

  const clock = createFakeClock({ startMs: Date.parse('2026-10-16T09:00:00Z') });

  const testLog = await startCredentialTestLog({ clock });

  const lookups = { gate: Promise.withResolvers<void>(), count: 0 };

  lookups.gate.resolve();

  const hooks: {
    afterCounterRead: ((credentialID: string) => Promise<void>) | null;
    beforeKeyCreated: (() => Promise<void>) | null;
  } = { afterCounterRead: null, beforeKeyCreated: null };

  const held = await createHeldTestStore({
    afterCounterRead: async (credentialID) => {
      await hooks.afterCounterRead?.(credentialID);
    },
    beforeKeyCreated: async () => {
      await hooks.beforeKeyCreated?.();
    },
    log: testLog.log,
    ca: provider.ca,
    now: () => clock.now(),
    resolveHost: async () => {
      lookups.count += 1;

      await lookups.gate.promise;

      return ['127.0.0.1'];
    },
    tokenRequestTimeoutMs: 1000,
  });

  const logOutput: string[] = [];

  const captureOutput = (...args: readonly unknown[]) => {
    logOutput.push(formatConsoleArgs(args));
  };

  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const spy = spyOn(console, level).mockImplementation(captureOutput);

    onTestFinished(() => {
      spy.mockRestore();
    });
  }

  for (const stream of [process.stdout, process.stderr]) {
    const spy = spyOn(stream, 'write').mockImplementation((chunk) => {
      const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);

      logOutput.push(text);

      return true;
    });

    onTestFinished(() => {
      spy.mockRestore();
    });
  }

  const exchangeCode = (
    client: BindingRef<'database'>,
    credentialID: string = crypto.randomUUID(),
  ) =>
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
    readLookupCount: () => lookups.count,
    countRefreshRequests: () =>
      provider.requests.filter((request) => request.form['grant_type'] === 'refresh_token').length,

    // holds every host lookup that starts after this call, until the returned function runs
    pauseLookups: () => {
      lookups.gate = Promise.withResolvers<void>();

      return lookups.gate.resolve;
    },
    hooks,

    // whether each test value shows in a record, in the given result or in the log output
    readLeakFlags: async (result: unknown) => {
      const records = await readRecordEntries();

      const everything = JSON.stringify([records, result, logOutput]);

      return [
        'fake-access-token',
        'fake-refresh-token',
        'fake-client-secret-value',
        'fake-code',
      ].map((value) => everything.includes(value));
    },
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

  const after = await ctx.store.register(connection.tokenRef, ctx.spec('oauth_token'));

  expect([connection.token.removalCounter, after.removalCounter]).toStrictEqual([0, 1]);
});

test('it blocks every handle made before a removal', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const send = ctx.store.fetcher(connection.token, [ctx.provider.origin]);

  await ctx.store.remove(connection.tokenRef);

  expect(send(`${ctx.provider.origin}/data`)).rejects.toBeInstanceOf(CredentialRemovedError);
  expect(ctx.store.refresh(connection.token)).rejects.toBeInstanceOf(CredentialRemovedError);
});

test.each([
  {
    call: 'refresh',
    run: (ctx: Awaited<ReturnType<typeof setupTest>>, token: BindingRef<'database'>) =>
      ctx.store.refresh(token),
  },
  {
    call: 'refreshIfDue',
    run: (ctx: Awaited<ReturnType<typeof setupTest>>, token: BindingRef<'database'>) =>
      ctx.store.refreshIfDue(token),
  },
  {
    call: 'readStatus',
    run: (ctx: Awaited<ReturnType<typeof setupTest>>, token: BindingRef<'database'>) =>
      ctx.store.readStatus(token),
  },
])('it refuses $call on a handle made before a removal', async (row) => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  await ctx.store.remove(connection.tokenRef);

  expect(row.run(ctx, connection.token)).rejects.toBeInstanceOf(CredentialRemovedError);
});

test('it keeps a handle made before a removal out of the refresh of the reconnected credential', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const gate = Promise.withResolvers<void>();

  ctx.provider.answerToken(async (request) => {
    if (request.form['grant_type'] === 'refresh_token') {
      await gate.promise;
    }

    return Response.json({
      access_token: 'fake-access-token-9',
      refresh_token: 'fake-refresh-token-9',
      expires_in: 3600,
    });
  });

  const olderRefresh = ctx.store.refresh(connection.token);

  await waitFor(() => {
    expect(ctx.countRefreshRequests()).toBe(1);
  });

  await ctx.store.remove(connection.tokenRef);
  await ctx.exchangeCode(connection.client, connection.tokenRef.credentialID);

  const newer = await ctx.store.register(connection.tokenRef, ctx.spec('oauth_token'));

  const newerRefresh = ctx.store.refresh(newer);

  await waitFor(() => {
    expect(ctx.countRefreshRequests()).toBe(2);
  });

  const olderAgain = ctx.store.refresh(connection.token);

  expect(olderAgain).rejects.toBeInstanceOf(CredentialRemovedError);

  gate.resolve();

  const outcomes = await Promise.all([olderRefresh, newerRefresh]);

  expect(outcomes).toStrictEqual(['removed', 'saved']);
});

test('it lets an adapter tell a removed handle from a failure of the service', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  await ctx.store.remove(connection.tokenRef);

  expect(ctx.store.refresh(connection.token)).rejects.toBeInstanceOf(CredentialRefusalError);
});

test('it sends the code, the client secret and the verifier in the exchange body, never in a header', async () => {
  const ctx = await setupTest();

  const clientRef = { backend: 'database', credentialID: crypto.randomUUID() } as const;

  await ctx.backend.writeClient(clientRef.credentialID, {
    clientID: 'client-123',
    clientSecret: 'fake-client-secret-value',
  });

  const client = await ctx.store.register(clientRef, ctx.spec('oauth_client'));

  await ctx.store.exchange(client, {
    code: 'fake-code',
    redirectURI: 'https://nixie.example/callback',
    codeVerifier: 'fake-verifier',
    credentialID: crypto.randomUUID(),
  });

  expect(ctx.provider.requests).toStrictEqual([
    {
      host: 'auth.test',
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
    clientID: 'client-123',
    clientSecret: 'fake-client-secret-value',
  });

  const client = await ctx.store.register(clientRef, ctx.spec('oauth_client'));
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

  await waitFor(() => {
    expect(ctx.provider.requests).toHaveLength(2);
  });

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

  expect(send(`${ctx.provider.origin}/data`)).rejects.toBeInstanceOf(CredentialRefusalError);
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

test('it deletes the old key after a refresh saves', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();
  const before = await ctx.backend.readToken(connection.tokenRef.credentialID);

  await ctx.store.refresh(connection.token);

  const after = await ctx.backend.readToken(connection.tokenRef.credentialID);

  expect(before?.keyID).not.toBe(after?.keyID);
  expect(ctx.backend.readKeyIDs()).toStrictEqual([after?.keyID ?? '']);
});

test('it deletes the new key after a refresh fails, and keeps the original', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();
  const before = await ctx.backend.readToken(connection.tokenRef.credentialID);

  ctx.provider.answerToken(() => new Response('down', { status: 503 }));

  await ctx.store.refresh(connection.token);

  expect(ctx.backend.readKeyIDs()).toStrictEqual([before?.keyID ?? '']);
});

test.each([
  {
    reply: { access_token: 'fake-access-token-9', refresh_token: 'fake-refresh-token-9' },
    revoked: 'fake-refresh-token-9',
    title: 'a new refresh token',
  },
  {
    reply: { access_token: 'fake-access-token-9' },
    revoked: 'fake-access-token-9',
    title: 'only a new access token',
  },
])(
  'it revokes the token a refresh received and saves nothing when a removal moved the counter, for $title',
  async (row) => {
    const ctx = await setupTest();
    const connection = await ctx.connectCredential();

    const gate = Promise.withResolvers<void>();

    ctx.provider.answerToken(async () => {
      await gate.promise;

      return Response.json({ ...row.reply, expires_in: 3600 });
    });

    const running = ctx.store.refresh(connection.token);

    await waitFor(() => {
      expect(ctx.provider.requests).toHaveLength(2);
    });

    await ctx.store.remove(connection.tokenRef);

    gate.resolve();

    const outcome = await running;

    const revoke = ctx.provider.requests.find((request) => request.path === '/revoke');

    const saved = await ctx.backend.readToken(connection.tokenRef.credentialID);
    const discarded = await ctx.readRecordPayloads('credential.refresh_discarded');

    expect(outcome).toBe('removed');
    expect(revoke?.form['token']).toBe(row.revoked);
    expect(saved).toBeNull();

    expect(discarded).toMatchObject([
      { credentialID: connection.tokenRef.credentialID, isRevoked: true },
    ]);
  },
);

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
    clientID: 'client-123',
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

  const client = await ctx.store.register(clientRef, ctx.spec('oauth_client'));

  expect(ctx.exchangeCode(client)).rejects.toMatchObject({
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
    clientID: 'client-123',
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
        sub: 42,
        ...row.claims,
      }),
    }),
  );

  const client = await ctx.store.register(clientRef, ctx.spec('oauth_client'));

  const failure = ctx.store.exchange(client, {
    code: 'fake-code',
    redirectURI: 'https://nixie.example/callback',
    credentialID: tokenID,
  });

  await Promise.allSettled([failure]);

  expect(failure).rejects.toMatchObject({ name: 'TokenRequestError', code: row.code });

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
    clientID: 'client-123',
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

  const client = await ctx.store.register(clientRef, ctx.spec('oauth_client'));
  const result = await ctx.exchangeCode(client);

  expect(result.account).toStrictEqual({ subject: 'subject-1', email: 'wren@example.test' });
});

test('it puts no token, client secret or key in a record, an error or the log output', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  await ctx.store.refresh(connection.token);

  ctx.provider.answerToken(() => Response.json({ error: 'invalid_grant' }, { status: 400 }));

  await ctx.store.refresh(connection.token);

  const failure = await ctx.store
    .fetcher(connection.token, [ctx.provider.origin])(`${ctx.provider.origin}/data`)
    .catch(String);

  const leaks = await ctx.readLeakFlags(failure);

  expect(leaks).toStrictEqual([false, false, false, false]);
});

test('it finds a token that the log output carries inside a field of an object', async () => {
  const ctx = await setupTest();

  console.error('refresh failed', { detail: { token: 'fake-refresh-token-planted' } });

  const leaks = await ctx.readLeakFlags('');

  expect(leaks).toStrictEqual([false, true, false, false]);
});

test('it finds a token that the log output joins from parts of a format string', async () => {
  const ctx = await setupTest();

  console.error('%s%s', 'fake-access', '-token-planted');

  const leaks = await ctx.readLeakFlags('');

  expect(leaks).toStrictEqual([true, false, false, false]);
});

test('it finds a token that the log output joins from an array and a string under a format string', async () => {
  const ctx = await setupTest();

  console.error('%s%s', ['fake-access'], '-token-planted');

  const leaks = await ctx.readLeakFlags('');

  expect(leaks).toStrictEqual([true, false, false, false]);
});

test('it finds a token that a write to standard error carries as bytes', async () => {
  const ctx = await setupTest();

  process.stderr.write(new TextEncoder().encode('fake-access-token-planted\n'));

  const leaks = await ctx.readLeakFlags('');

  expect(leaks).toStrictEqual([true, false, false, false]);
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
  const register = ctx.store.register(clientRef, { ...ctx.spec('oauth_client'), origins: [] });

  expect(register).rejects.toThrow(/not an origin of the credential/u);
});

test('it stops a request whose credential was removed while its host lookup waited', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => new Response('ok'));

  const requestsBefore = ctx.provider.requests.length;
  const lookupsBefore = ctx.readLookupCount();
  const send = ctx.store.fetcher(connection.token, [ctx.provider.origin]);
  const release = ctx.pauseLookups();
  const sending = send(`${ctx.provider.origin}/data`);

  await waitFor(() => {
    expect(ctx.readLookupCount()).toBe(lookupsBefore + 1);
  });

  await ctx.store.remove(connection.tokenRef);

  release();

  await Promise.allSettled([sending]);

  expect(sending).rejects.toBeInstanceOf(CredentialRemovedError);
  expect(ctx.provider.requests).toHaveLength(requestsBefore);
});

test('it sends no refresh when the credential was removed while the rejected response waited', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const gate = Promise.withResolvers<void>();

  ctx.provider.answerToken(async () => {
    await gate.promise;

    return new Response('denied', { status: 401 });
  });

  const sending = ctx.store.fetcher(connection.token, [ctx.provider.origin])(
    `${ctx.provider.origin}/data`,
  );

  await waitFor(() => {
    expect(ctx.provider.requests.some((request) => request.path === '/data')).toBe(true);
  });

  await ctx.store.remove(connection.tokenRef);

  gate.resolve();

  await Promise.allSettled([sending]);

  expect(sending).rejects.toBeInstanceOf(CredentialRemovedError);
  expect(ctx.countRefreshRequests()).toBe(0);
});

test('it refuses the answer to a request whose credential was removed while the answer waited', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const gate = Promise.withResolvers<void>();

  ctx.provider.answerToken(async () => {
    await gate.promise;

    return new Response('data');
  });

  const sending = ctx.store.fetcher(connection.token, [ctx.provider.origin])(
    `${ctx.provider.origin}/data`,
  );

  await waitFor(() => {
    expect(ctx.provider.requests.some((request) => request.path === '/data')).toBe(true);
  });

  await ctx.store.remove(connection.tokenRef);

  gate.resolve();

  expect(sending).rejects.toBeInstanceOf(CredentialRemovedError);
});

test('it aborts a request in flight when its credential is removed', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const gate = Promise.withResolvers<void>();
  let isData = false;

  ctx.provider.answerToken(async (request) => {
    if (request.path === '/token') {
      return Response.json({ access_token: 'fake-access-token-9', expires_in: 3600 });
    }

    isData = true;

    await gate.promise;

    return new Response('fine');
  });

  const sending = ctx.store.fetcher(connection.token, [ctx.provider.origin])(
    `${ctx.provider.origin}/data`,
  );

  await waitFor(() => {
    expect(isData).toBeTrue();
  });

  onTestFinished(() => {
    gate.resolve();
  });

  await ctx.store.remove(connection.tokenRef);

  const failure = await sending.catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(CredentialRemovedError);
});

test('it leaves the status of a reconnected credential alone when an older handle is rejected', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken((request) =>
    request.path === '/token'
      ? Response.json({ access_token: 'fake-access-token-9', expires_in: 3600 })
      : new Response('denied', { status: 401 }),
  );

  await ctx.store.remove(connection.tokenRef);
  await ctx.exchangeCode(connection.client, connection.tokenRef.credentialID);

  const newer = await ctx.store.register(connection.tokenRef, ctx.spec('oauth_token'));

  const sending = ctx.store.fetcher(connection.token, [ctx.provider.origin])(
    `${ctx.provider.origin}/data`,
  );

  await Promise.allSettled([sending]);

  expect(sending).rejects.toBeInstanceOf(CredentialRemovedError);

  const status = await ctx.store.readStatus(newer);

  expect(status).toMatchObject({ status: 'active' });
});

test('it keeps the provider endpoints a credential registered with, whatever the caller changes later', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const provider = {
    tokenURL: ctx.provider.tokenURL,
    revokeURL: ctx.provider.revokeURL,
    issuer: 'https://issuer.example',
    clientID: 'client-123',
  };

  const spec = { ...ctx.spec('oauth_token'), label: 'Changed account', provider };

  const token = await ctx.store.register(connection.tokenRef, spec);

  Object.assign(provider, {
    tokenURL: ctx.provider.tokenURL.replace('auth.test', 'other.test'),
    revokeURL: ctx.provider.revokeURL.replace('auth.test', 'other.test'),
  });

  await ctx.store.refresh(token);

  expect(ctx.provider.requests.at(-1)?.host).toBe('auth.test');
});

test('it refreshes once, and retries once, when the refreshed token expires within 5 minutes', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  let dataCalls = 0;

  ctx.provider.answerToken((request) => {
    if (request.path === '/token') {
      return Response.json({ access_token: 'fake-access-token-9', expires_in: 60 });
    }

    dataCalls += 1;

    return new Response('data', { status: dataCalls === 1 ? 401 : 200 });
  });

  const response = await ctx.store.fetcher(connection.token, [ctx.provider.origin])(
    `${ctx.provider.origin}/data`,
  );

  expect([response.status, ctx.countRefreshRequests()]).toStrictEqual([200, 1]);
});

test('it replays the body of a streamed request on the retry after a rejection', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  let dataCalls = 0;

  ctx.provider.answerToken((request) => {
    if (request.path === '/token') {
      return Response.json({ access_token: 'fake-access-token-9', expires_in: 3600 });
    }

    dataCalls += 1;

    return new Response('data', { status: dataCalls === 1 ? 401 : 200 });
  });

  const body = new ReadableStream({
    start: (controller) => {
      controller.enqueue(new TextEncoder().encode('field=value'));
      controller.close();
    },
  });

  const response = await ctx.store.fetcher(connection.token, [ctx.provider.origin])(
    `${ctx.provider.origin}/data`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      duplex: 'half',
    },
  );

  const forms = ctx.provider.requests
    .filter((request) => request.path === '/data')
    .map((request) => request.form);

  expect(response.status).toBe(200);
  expect(forms).toStrictEqual([{ field: 'value' }, { field: 'value' }]);
});

test('it counts a provider that never answers a refresh as no answer after the deadline', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => new Promise<Response>(() => {}));

  const outcome = await ctx.store.refresh(connection.token);
  const status = await ctx.store.readStatus(connection.token);
  const failed = await ctx.readRecordPayloads('credential.refresh_failed');

  expect(outcome).toBe('failed');
  expect(status).toMatchObject({ status: 'active', failures: 1 });
  expect(failed).toMatchObject([{ outcome: 'no_answer' }]);
});

test('it sends the next refresh after one that never got an answer', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => new Promise<Response>(() => {}));

  await ctx.store.refresh(connection.token);
  await ctx.store.refresh(connection.token);

  expect(ctx.countRefreshRequests()).toBe(2);
});

test('it marks the credential needs_consent, and revokes the new tokens, when a second code names another account', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const answerWithAccount = (subject: string, suffix: string) => {
    ctx.provider.answerToken(() =>
      Response.json({
        access_token: `fake-access-token-${suffix}`,
        refresh_token: `fake-refresh-token-${suffix}`,
        expires_in: 3600,
        id_token: buildIDToken({
          iss: 'https://issuer.example',
          aud: 'client-123',
          exp: ctx.clock.now() / 1000 + 600,
          sub: subject,
        }),
      }),
    );
  };

  const credentialID = crypto.randomUUID();

  answerWithAccount('subject-1', 'first');

  await ctx.exchangeCode(connection.client, credentialID);

  answerWithAccount('subject-2', 'second');

  const second = ctx.exchangeCode(connection.client, credentialID);

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({
    name: 'TokenRequestError',
    code: 'account_changed',
  });

  const saved = await ctx.backend.readToken(credentialID);

  expect(saved?.accessToken).toBe('fake-access-token-first');
  expect(saved?.state.status).toBe('needs_consent');

  expect(ctx.provider.requests.at(-1)).toMatchObject({
    path: '/revoke',
    form: { token: 'fake-refresh-token-second' },
  });
});

test('it replaces the token, and deletes the old key, when a second code names the same account', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() =>
    Response.json({
      access_token: 'fake-access-token-9',
      expires_in: 3600,
      id_token: buildIDToken({
        iss: 'https://issuer.example',
        aud: 'client-123',
        exp: ctx.clock.now() / 1000 + 600,
        sub: 'subject-1',
      }),
    }),
  );

  const credentialID = crypto.randomUUID();

  await ctx.exchangeCode(connection.client, credentialID);
  await ctx.exchangeCode(connection.client, credentialID);

  const saved = await ctx.backend.readToken(credentialID);
  const connected = await ctx.backend.readToken(connection.tokenRef.credentialID);

  expect(saved?.state.status).toBe('active');

  expect(ctx.backend.readKeyIDs().toSorted()).toStrictEqual(
    [saved?.keyID ?? '', connected?.keyID ?? ''].toSorted(),
  );
});

test('it holds a removal until the counter check before a send has handed the request off', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerToken(() => new Response('data'));

  const send = ctx.store.fetcher(connection.token, [ctx.provider.origin]);
  const lookupsBefore = ctx.readLookupCount();
  const release = ctx.pauseLookups();
  const sending = send(`${ctx.provider.origin}/data`);

  await waitFor(() => {
    expect(ctx.readLookupCount()).toBe(lookupsBefore + 1);
  });

  const seen = { removal: Promise.resolve(), hasCounterMoved: false };

  ctx.hooks.afterCounterRead = async (read) => {
    ctx.hooks.afterCounterRead = null;
    seen.removal = ctx.store.remove(connection.tokenRef);

    const turn = Promise.withResolvers<void>();

    setImmediate(turn.resolve);

    await turn.promise;

    seen.hasCounterMoved = (await ctx.backend.readRemovalCounter(read)) !== 0;
  };

  release();

  await Promise.allSettled([sending]);

  await seen.removal;

  expect(seen.hasCounterMoved).toBe(false);
});

test.each([
  {
    answer: 'new tokens',
    status: 200,
    body: {
      access_token: 'fake-access-token-9',
      refresh_token: 'fake-refresh-token-9',
      expires_in: 3600,
    },
  },
  { answer: 'invalid_grant', status: 400, body: { error: 'invalid_grant' } },
  { answer: 'a server error', status: 500, body: { error: 'server_error' } },
])(
  'it refuses, and never returns the 401, when the credential was removed during the refresh after it and the refresh got $answer',
  async (row) => {
    const ctx = await setupTest();
    const connection = await ctx.connectCredential();

    const gate = Promise.withResolvers<void>();

    ctx.provider.answerToken(async (request) => {
      if (request.path === '/data') {
        return new Response('denied', { status: 401 });
      }

      await gate.promise;

      return Response.json(row.body, { status: row.status });
    });

    const sending = ctx.store.fetcher(connection.token, [ctx.provider.origin])(
      `${ctx.provider.origin}/data`,
    );

    await waitFor(() => {
      expect(ctx.countRefreshRequests()).toBe(1);
    });

    await ctx.store.remove(connection.tokenRef);

    gate.resolve();

    expect(sending).rejects.toBeInstanceOf(CredentialRemovedError);
  },
);

test('it lets one of two overlapping exchanges into one credential save, and revokes the tokens of the other', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const answers = { count: 0 };

  ctx.provider.answerToken(() => {
    answers.count += 1;

    return Response.json({
      access_token: `fake-access-token-exchange-${String(answers.count)}`,
      refresh_token: `fake-refresh-token-exchange-${String(answers.count)}`,
      expires_in: 3600,
      id_token: buildIDToken({
        iss: 'https://issuer.example',
        aud: 'client-123',
        exp: ctx.clock.now() / 1000 + 600,
        sub: `subject-${String(answers.count)}`,
      }),
    });
  });

  // Each exchange reads the client's counter before it sends and again after the answer. A save
  // waits for 4 such reads and one turn of the event loop, which lets an exchange that holds no
  // lock read the credential's slot, so both exchanges overlap.
  const clientReads = { count: 0 };

  ctx.hooks.afterCounterRead = (read) => {
    clientReads.count += Number(read === connection.clientRef.credentialID);

    return Promise.resolve();
  };

  ctx.hooks.beforeKeyCreated = async () => {
    await waitFor(() => {
      expect(clientReads.count).toBeGreaterThanOrEqual(4);
    });
  };

  const credentialID = crypto.randomUUID();

  const outcomes = await Promise.allSettled([
    ctx.exchangeCode(connection.client, credentialID),
    ctx.exchangeCode(connection.client, credentialID),
  ]);

  const saved = await ctx.backend.readToken(credentialID);
  const connected = await ctx.backend.readToken(connection.tokenRef.credentialID);

  const revoked = ctx.provider.requests
    .filter((request) => request.path === '/revoke')
    .map((request) => request.form['token'] ?? '');

  expect(outcomes.map((outcome) => outcome.status).toSorted()).toStrictEqual([
    'fulfilled',
    'rejected',
  ]);

  expect([
    revoked.length,
    revoked.includes(saved?.refreshToken ?? ''),
    revoked.every((token) => token.startsWith('fake-refresh-token-exchange-')),
  ]).toStrictEqual([1, false, true]);

  expect(ctx.backend.readKeyIDs().toSorted()).toStrictEqual(
    [saved?.keyID ?? '', connected?.keyID ?? ''].toSorted(),
  );
});

test('it refuses every exchange whose OAuth client was removed before it saved, and revokes its tokens', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  const answers = { count: 0 };

  ctx.provider.answerToken(() => {
    answers.count += 1;

    return Response.json({
      access_token: `fake-access-token-exchange-${String(answers.count)}`,
      refresh_token: `fake-refresh-token-exchange-${String(answers.count)}`,
      expires_in: 3600,
    });
  });

  const clientReads = { count: 0 };
  const gate = Promise.withResolvers<void>();

  ctx.hooks.afterCounterRead = (read) => {
    clientReads.count += Number(read === connection.clientRef.credentialID);

    return Promise.resolve();
  };

  ctx.hooks.beforeKeyCreated = () => gate.promise;

  const credentialID = crypto.randomUUID();

  const exchanges = Promise.allSettled([
    ctx.exchangeCode(connection.client, credentialID),
    ctx.exchangeCode(connection.client, credentialID),
  ]);

  await waitFor(() => {
    expect(clientReads.count).toBeGreaterThanOrEqual(4);
  });

  await ctx.store.remove(connection.clientRef);

  gate.resolve();

  const outcomes = await exchanges;

  const refused = outcomes.filter(
    (outcome) => outcome.status === 'rejected' && outcome.reason instanceof CredentialRemovedError,
  );

  const revoked = ctx.provider.requests.filter((request) => request.path === '/revoke');

  const saved = await ctx.backend.readToken(credentialID);

  expect([refused.length, revoked.length, saved === null]).toStrictEqual([2, 2, true]);
});

test('it revokes the tokens of an exchange whose save failed before it kept them', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.hooks.beforeKeyCreated = () => Promise.reject(new Error('the key store is unavailable'));

  const exchanging = ctx.exchangeCode(connection.client);

  await Promise.allSettled([exchanging]);

  expect(exchanging).rejects.toThrow('the key store is unavailable');

  const revoked = ctx.provider.requests.filter((request) => request.path === '/revoke');

  expect(revoked).toHaveLength(1);
});

test('it revokes the refresh token once with the client secret in the body and no header', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();
  const result = await ctx.store.revoke(connection.token);

  const sent = ctx.provider.requests.filter((request) => request.path === '/revoke');

  expect(result).toStrictEqual({ outcome: 'confirmed', status: 200, providerError: null });

  expect(
    sent.map((request) => [
      request.form['token'] === 'fake-refresh-token-1',
      request.form['client_secret'] === 'fake-client-secret-value',
      request.authorization,
    ]),
  ).toStrictEqual([[true, true, null]]);
});

test('it answers refused with the provider error when the revoke endpoint answers 400', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerRevoke(() =>
    Response.json({ error: 'invalid_token', error_description: 'free text' }, { status: 400 }),
  );

  const result = await ctx.store.revoke(connection.token);

  expect(result).toStrictEqual({ outcome: 'refused', status: 400, providerError: 'invalid_token' });
});

test('it answers unknown when the revoke endpoint answers with a server error', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  ctx.provider.answerRevoke(() => new Response(null, { status: 503 }));

  const result = await ctx.store.revoke(connection.token);

  expect(result).toStrictEqual({ outcome: 'unknown', status: 503, providerError: null });
});

test('it sends nothing and answers not_attempted for a credential that holds no token', async () => {
  const ctx = await setupTest();
  const connection = await ctx.connectCredential();

  await ctx.store.remove(connection.tokenRef);
  await ctx.backend.remove(connection.tokenRef.credentialID);

  const token = await ctx.store.register(connection.tokenRef, ctx.spec('oauth_token'));
  const result = await ctx.store.revoke(token);

  expect(result).toStrictEqual({ outcome: 'not_attempted', status: null, providerError: null });
});
