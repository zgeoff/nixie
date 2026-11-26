import { expect, onTestFinished, test } from 'bun:test';
import { CredentialRemovedError } from '@heynixie/credentials';
import { buildIDToken } from '@heynixie/credentials/test-utils';
import { readErasureFinishedSequence, readRecordKeys, readRecords } from '@heynixie/log';
import { waitFor } from '@zgeoff/testing';
import { revocationRecordedCodec } from './record/revocation-recorded-codec';
import type { ConnectionsHarnessOptions } from './test-utils/start-connections-harness';
import { startConnectionsHarness } from './test-utils/start-connections-harness';

async function setupTest(options: ConnectionsHarnessOptions = {}) {
  const harness = await startConnectionsHarness(options);

  const readRevocations = async () => {
    const records = await readRecords(harness.log, {
      afterSequence: 0,
      kinds: [revocationRecordedCodec.kind],
    });

    return records.map((entry) => revocationRecordedCodec.decode(entry.record.payload));
  };

  const readKinds = async () => {
    const records = await readRecords(harness.log, { afterSequence: 0 });

    return records.map((entry) => entry.record.kind);
  };

  const readOutcomes = async () => {
    const revocations = await readRevocations();

    return revocations.map((revocation) => revocation.outcome);
  };

  const countKeys = async () => {
    const keys = await harness.readKeyIDs();

    return keys.length;
  };

  const countRevokes = () =>
    harness.provider.requests.filter((request) => request.path === '/revoke').length;

  return { ...harness, readRevocations, readOutcomes, countKeys, readKinds, countRevokes };
}

test('it records the revocation outcome before it deletes the keys', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();
  const before = await ctx.countKeys();

  ctx.effects.crashAt('erasure.revoked');

  const begun = await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await Promise.allSettled([ctx.connections.forget.finish(connection.tokenRef.credentialID)]);

  expect(begun.status).toBe('begun');

  const revocations = await ctx.readRevocations();
  const after = await ctx.countKeys();

  expect([revocations, after === before]).toStrictEqual([
    [
      {
        connection: connection.tokenRef.credentialID,
        outcome: 'confirmed',
        status: 200,
        googleError: null,
      },
    ],
    true,
  ]);
});

test('it deletes the keys and sends the revocation once after a crash between them', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();
  const before = await ctx.countKeys();

  ctx.effects.crashAt('erasure.revoked');

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await Promise.allSettled([ctx.connections.forget.finish(connection.tokenRef.credentialID)]);
  await ctx.runner.finishOpen();

  const after = await ctx.countKeys();
  const revocations = await ctx.readRevocations();

  expect([ctx.countRevokes(), revocations.length, before - after]).toStrictEqual([1, 1, 2]);
});

test('it records unknown and sends nothing for a forget that began and never revoked', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  ctx.effects.crashAt('erasure.begun');

  await Promise.allSettled([
    ctx.connections.forget.begin({ connection: connection.tokenRef.credentialID }, { by: 'user' }),
  ]);

  const lost = await ctx.connections.writeLostRevocations();

  await ctx.runner.finishOpen();

  const outcomes = await ctx.readOutcomes();

  expect([lost, ctx.countRevokes(), outcomes]).toStrictEqual([1, 0, ['unknown']]);
});

test('it sends the one revocation with the refresh token and the client secret', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await ctx.connections.forget.finish(connection.tokenRef.credentialID);

  const sent = ctx.provider.requests.find((request) => request.path === '/revoke');

  expect([
    sent?.form['token'] === 'fake-refresh-token-1',
    sent?.form['client_secret'] === 'fake-client-secret-value',
    sent?.form['client_id'],
  ]).toStrictEqual([true, true, 'client-123']);
});

test('it makes the tokens unreadable and keeps the row of a forgotten connection', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  const id = connection.tokenRef.credentialID;

  const before = await ctx.readRow(id);

  await ctx.connections.forget.begin({ connection: id }, { by: 'user' });
  await ctx.connections.forget.finish(id);

  const row = await ctx.readRow(id);
  const keys = await ctx.readKeyIDs();

  expect([
    row?.refresh_token_sealed,
    row?.account_sealed,
    row?.token_key_id,
    row?.binding,
    row?.status,
    row?.short_id === before?.short_id,
    keys.includes(before?.key_id ?? ''),
    keys.includes(before?.token_key_id ?? ''),
    await ctx.held.backend.readToken(id),
  ]).toStrictEqual([null, null, null, 'removed', 'forgotten', true, false, false, null]);
});

test.each([
  { name: 'confirmed', status: 200, outcome: 'confirmed', googleError: null },
  { name: 'refused', status: 400, outcome: 'refused', googleError: 'invalid_token' },
  { name: 'unknown', status: 503, outcome: 'unknown', googleError: null },
  { name: 'unconfirmed', status: 202, outcome: 'unknown', googleError: null },
])('it records a $name revocation when the provider answers $status', async (row) => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  ctx.provider.answerRevoke(() =>
    row.status === 400
      ? Response.json({ error: 'invalid_token', error_description: 'free text' }, { status: 400 })
      : new Response(null, { status: row.status }),
  );

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await ctx.connections.forget.finish(connection.tokenRef.credentialID);

  const revocations = await ctx.readRevocations();

  expect(revocations).toStrictEqual([
    {
      connection: connection.tokenRef.credentialID,
      outcome: row.outcome,
      status: row.status,
      googleError: row.googleError,
    },
  ]);
});

test('it records not_attempted when the connection has no client to revoke with', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  await ctx.held.backend.remove(connection.clientRef.credentialID);

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await ctx.connections.forget.finish(connection.tokenRef.credentialID);

  const outcomes = await ctx.readOutcomes();

  expect([ctx.countRevokes(), outcomes]).toStrictEqual([0, ['not_attempted']]);
});

test('it asks no session to clean up after a forgotten connection', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await ctx.connections.forget.finish(connection.tokenRef.credentialID);

  expect(ctx.effects.cleanedCauses).toStrictEqual([]);
});

test('it refuses a forget of a connection that is unknown or already forgotten', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await ctx.connections.forget.finish(connection.tokenRef.credentialID);

  const again = await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  const unknown = await ctx.connections.forget.begin({ connection: 'nothing' }, { by: 'user' });

  expect([again, unknown]).toStrictEqual([
    { status: 'refused', reason: 'not_found' },
    { status: 'refused', reason: 'not_found' },
  ]);
});

test('it aborts a fetch in flight when a forget begins', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  const gate = Promise.withResolvers<void>();
  let isReceived = false;

  ctx.provider.answerToken(async (request) => {
    if (request.path === '/data') {
      isReceived = true;

      await gate.promise;
    }

    return new Response('fine');
  });

  const fetching = Promise.allSettled([
    ctx.held.store.fetcher(connection.token, [ctx.provider.apiOrigin])(
      `${ctx.provider.apiOrigin}/data`,
    ),
  ]);

  await waitFor(() => {
    expect(isReceived).toBeTrue();
  });

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  const [result] = await fetching;

  gate.resolve();

  expect(result).toMatchObject({ status: 'rejected', reason: expect.any(CredentialRemovedError) });
});

test('it saves no refresh after a forget moved the removal counter', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  const gate = Promise.withResolvers<void>();
  let isRefreshing = false;

  ctx.provider.answerToken(async (request) => {
    if (request.form['grant_type'] === 'refresh_token') {
      isRefreshing = true;

      await gate.promise;
    }

    return Response.json({
      access_token: 'fake-access-token-2',
      refresh_token: 'fake-refresh-token-2',
      expires_in: 3600,
    });
  });

  const refreshing = ctx.held.store.refresh(connection.token);

  await waitFor(() => {
    expect(isRefreshing).toBeTrue();
  });

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  gate.resolve();

  const outcome = await refreshing;
  const kinds = await ctx.readKinds();

  const revoked = ctx.provider.requests.find((request) => request.path === '/revoke');

  expect([
    outcome,
    kinds.includes('credential.refresh_saved'),
    kinds.includes('credential.refresh_discarded'),
    revoked?.form['token'] === 'fake-refresh-token-2',
  ]).toStrictEqual(['removed', false, true, true]);
});

test('it leaves a copy of the database from before the forget with sealed values that no key opens', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  const id = connection.tokenRef.credentialID;

  const copy = await ctx.readRow(id);

  await ctx.connections.forget.begin({ connection: id }, { by: 'user' });
  await ctx.connections.forget.finish(id);

  const keyIDs = [copy?.key_id ?? '', copy?.token_key_id ?? ''];

  const keys = await readRecordKeys(ctx.log, keyIDs);
  const finished = await readErasureFinishedSequence(ctx.log, 'credential', id);

  expect([copy?.refresh_token_sealed === null, keys.size, finished !== null]).toStrictEqual([
    false,
    0,
    true,
  ]);
});

test('it keeps the logged requests of other threads when a connection is forgotten', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  ctx.effects.seedInput('task-unrelated', 5);

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await ctx.connections.forget.finish(connection.tokenRef.credentialID);

  expect(ctx.effects.readInputs()).toStrictEqual([['task-unrelated', 5]]);
});

test('it revokes the rotated token of a connection whose account key a forget deleted before the save', async () => {
  const ctx = await setupTest();

  ctx.provider.answerToken(() =>
    Response.json({
      access_token: 'fake-access-token-1',
      refresh_token: 'fake-refresh-token-1',
      expires_in: 3600,
      id_token: buildIDToken({
        iss: 'https://issuer.example',
        aud: 'client-123',
        exp: ctx.clock.now() / 1000 + 600,
        sub: 'account-subject-1',
      }),
    }),
  );

  const connection = await ctx.seedConnection();

  ctx.provider.answerToken(() =>
    Response.json({
      access_token: 'fake-access-token-2',
      refresh_token: 'fake-refresh-token-2',
      expires_in: 3600,
    }),
  );

  ctx.hooks.beforeTokenWrite = async () => {
    await ctx.connections.forget.begin(
      { connection: connection.tokenRef.credentialID },
      { by: 'user' },
    );

    await ctx.runner.finishOpen();
  };

  const outcome = await ctx.held.store.refresh(connection.token);
  const kinds = await ctx.readKinds();

  const revoked = ctx.provider.requests.filter(
    (request) => request.path === '/revoke' && request.form['token'] === 'fake-refresh-token-2',
  );

  expect([outcome, kinds.includes('credential.refresh_saved'), revoked.length]).toStrictEqual([
    'removed',
    false,
    1,
  ]);
});

test('it keeps the tokens of a refresh out of the own values when a forget finishes after the save', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  const saved = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();

  ctx.provider.answerToken(() =>
    Response.json({
      access_token: 'fake-access-token-2',
      refresh_token: 'fake-refresh-token-2',
      expires_in: 3600,
    }),
  );

  ctx.hooks.afterTokenSaved = async () => {
    saved.resolve();

    await release.promise;
  };

  const refreshing = ctx.held.store.refresh(connection.token);

  await saved.promise;

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await ctx.runner.finishOpen();

  release.resolve();

  await refreshing;

  const values = ctx.held.ownValues.read({ minChars: 1 });

  expect([
    values.includes('fake-access-token-2'),
    values.includes('fake-refresh-token-2'),
  ]).toStrictEqual([false, false]);
});

test('it ends a fetch that waits on a refresh when a forget begins, before the provider answers', async () => {
  const ctx = await setupTest({ tokenRequestTimeoutMs: 60_000 });
  const connection = await ctx.seedConnection();

  const gate = Promise.withResolvers<void>();
  let isRefreshing = false;

  onTestFinished(() => {
    gate.resolve();
  });

  ctx.provider.answerToken(async (request) => {
    if (request.path === '/data') {
      return new Response('expired', { status: 401 });
    }

    isRefreshing = true;

    await gate.promise;

    return Response.json({
      access_token: 'fake-access-token-2',
      refresh_token: 'fake-refresh-token-2',
      expires_in: 3600,
    });
  });

  const fetching = Promise.allSettled([
    ctx.held.store.fetcher(connection.token, [ctx.provider.apiOrigin])(
      `${ctx.provider.apiOrigin}/data`,
    ),
  ]);

  await waitFor(() => {
    expect(isRefreshing).toBeTrue();
  });

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  const [result] = await fetching;

  expect(result).toMatchObject({ status: 'rejected', reason: expect.any(CredentialRemovedError) });
});

test('it erases what other modules keep of a connection after the forget begins and after its keys go', async () => {
  const erased: string[] = [];

  const ctx = await setupTest({
    eraseDependents: (connectionID) => {
      erased.push(connectionID);

      return Promise.resolve();
    },
  });

  const connection = await ctx.seedConnection();

  await ctx.connections.forget.begin(
    { connection: connection.tokenRef.credentialID },
    { by: 'user' },
  );

  await ctx.connections.forget.finish(connection.tokenRef.credentialID);

  expect(erased).toStrictEqual([
    connection.tokenRef.credentialID,
    connection.tokenRef.credentialID,
  ]);
});
