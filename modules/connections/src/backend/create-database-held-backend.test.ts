import { expect, test } from 'bun:test';
import { CredentialRemovedError } from '@heynixie/credentials';
import { buildHeldSpec } from '@heynixie/credentials/test-utils';
import { createDatabaseTestStore } from '../test-build/create-database-test-store';
import { startConnectionsHarness } from '../test-utils/start-connections-harness';
import { createDatabaseHeldBackend } from './create-database-held-backend';

async function setupTest() {
  const harness = await startConnectionsHarness();

  const readRefreshToken = async (credentialID: string) => {
    const token = await harness.held.backend.readToken(credentialID);

    return token?.refreshToken ?? null;
  };

  // a backend of a new process over the same data: it holds no key and no access token in memory
  const restart = () =>
    createDatabaseHeldBackend({
      log: harness.log,
      definitions: () => ({ snapshotHash: 'test-snapshot' }),
      recorder: harness.held.recorder,
      now: () => harness.clock.now(),
    });

  return { ...harness, readRefreshToken, restart };
}

test('it saves a token and reads it back with its state and account', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();
  const token = await ctx.held.backend.readToken(connection.tokenRef.credentialID);

  expect([
    token?.clientCredentialID === connection.clientRef.credentialID,
    token?.accountSubject,
    token?.state.status,
    token?.state.failures,
  ]).toStrictEqual([true, null, 'active', 0]);
});

test('it seals the refresh token and the client secret under keys of their own', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();
  const row = await ctx.readRow(connection.tokenRef.credentialID);
  const client = await ctx.readClientRow(connection.clientRef.credentialID);

  const leaksToken = Buffer.from(row?.refresh_token_sealed ?? []).includes('fake-refresh-token-1');
  const leaksSecret = Buffer.from(client?.secret_sealed ?? []).includes('fake-client-secret-value');
  const keyIDs = [client?.key_id, row?.key_id, row?.token_key_id];

  expect([
    row?.refresh_token_sealed !== null,
    client?.secret_sealed !== null,
    leaksToken,
    leaksSecret,
    keyIDs.includes(undefined) || keyIDs.includes(null),
    new Set(keyIDs).size,
  ]).toStrictEqual([true, true, false, false, false, 3]);
});

test('it keeps the access token in memory, so a restart finds none', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();
  const before = await ctx.held.backend.readToken(connection.tokenRef.credentialID);
  const after = await ctx.restart().readToken(connection.tokenRef.credentialID);

  expect([before?.accessToken === 'fake-access-token-1', after?.accessToken === '']).toStrictEqual([
    true,
    true,
  ]);
});

test('it refreshes a token that a restart left without an access token', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  const restarted = await createDatabaseTestStore({
    log: ctx.log,
    ca: ctx.provider.ca,
    now: () => ctx.clock.now(),
  });

  const token = await restarted.store.register(
    connection.tokenRef,
    buildHeldSpec(ctx.provider, 'oauth_token'),
  );

  const outcome = await restarted.store.refreshIfDue(token);

  expect(outcome).toBe('saved');
});

test('it refuses a token whose client was removed after the exchange last checked it', async () => {
  const ctx = await setupTest();

  const clientID = crypto.randomUUID();
  const tokenID = crypto.randomUUID();

  await ctx.held.backend.writeClient(clientID, {
    clientID: 'client-123',
    clientSecret: 'fake-client-secret-value',
  });

  const client = await ctx.held.store.register(
    { backend: 'database', credentialID: clientID },
    buildHeldSpec(ctx.provider, 'oauth_client'),
  );

  ctx.hooks.beforeTokenWrite = async () => {
    await ctx.held.backend.remove(clientID);
  };

  const exchange = ctx.held.store.exchange(client, {
    code: 'fake-code',
    redirectURI: 'https://nixie.example/callback',
    credentialID: tokenID,
  });

  const [result] = await Promise.allSettled([exchange]);

  expect(result).toMatchObject({ status: 'rejected', reason: expect.any(CredentialRemovedError) });

  const row = await ctx.readRow(tokenID);

  expect(row).toBeNull();
});

test('it saves nothing when a refresh finds its client removed before the write', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  ctx.hooks.beforeTokenWrite = async () => {
    await ctx.held.backend.remove(connection.clientRef.credentialID);
  };

  const outcome = await ctx.held.store.refresh(connection.token);

  const isOldToken =
    (await ctx.readRefreshToken(connection.tokenRef.credentialID)) === 'fake-refresh-token-1';

  expect([outcome, isOldToken]).toStrictEqual(['removed', true]);
});

test('it keeps the old token whole when a refresh dies before its write', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  const crash = new Error('the process died');

  ctx.hooks.beforeTokenWrite = () => Promise.reject(crash);

  const [result] = await Promise.allSettled([ctx.held.store.refresh(connection.token)]);

  expect(result).toMatchObject({ status: 'rejected', reason: crash });

  const token = await ctx.held.backend.readToken(connection.tokenRef.credentialID);

  expect([token?.refreshToken === 'fake-refresh-token-1', token?.state.status]).toStrictEqual([
    true,
    'active',
  ]);
});

test('it deletes the key that a refresh made and never saved', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  ctx.hooks.beforeTokenWrite = () => Promise.reject(new Error('the process died'));

  await Promise.allSettled([ctx.held.store.refresh(connection.token)]);

  const before = await ctx.readKeyIDs();
  const [open] = await ctx.held.recorder.readOpenRefreshes();

  await ctx.held.recorder.write({
    event: 'refresh_lost',
    credentialID: connection.tokenRef.credentialID,
    attemptID: open?.attemptID ?? '',
  });

  const swept = await ctx.restart().sweepKeys();
  const after = await ctx.readKeyIDs();

  expect([before.length - after.length, swept.length]).toStrictEqual([1, 1]);
});

test('it saves a rotated token and leaves the key it replaced for the sweep', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();
  const before = await ctx.held.backend.readToken(connection.tokenRef.credentialID);

  ctx.hooks.afterTokenSaved = () => Promise.reject(new Error('the process died'));

  await Promise.allSettled([ctx.held.store.refresh(connection.token)]);

  const after = await ctx.held.backend.readToken(connection.tokenRef.credentialID);
  const keysBefore = await ctx.readKeyIDs();

  await ctx.restart().sweepKeys();

  const keysAfter = await ctx.readKeyIDs();

  expect([
    after?.refreshToken === 'fake-refresh-token-2',
    keysBefore.includes(before?.keyID ?? ''),
    keysAfter.includes(before?.keyID ?? ''),
    keysAfter.includes(after?.keyID ?? ''),
  ]).toStrictEqual([true, true, false, true]);
});

test('it leaves a key that a refresh in flight names to the sweep of the next start', async () => {
  const ctx = await setupTest();
  const keyID = await ctx.held.backend.createKey();

  await ctx.held.recorder.write({
    event: 'refresh_started',
    credentialID: crypto.randomUUID(),
    attemptID: crypto.randomUUID(),
    newKeyID: keyID,
  });

  const swept = await ctx.held.backend.sweepKeys();
  const keys = await ctx.readKeyIDs();

  expect([swept, keys.includes(keyID)]).toStrictEqual([[], true]);
});

test('it never sweeps a key that this process made for a save in flight', async () => {
  const ctx = await setupTest();
  const keyID = await ctx.held.backend.createKey();
  const swept = await ctx.held.backend.sweepKeys();
  const keys = await ctx.readKeyIDs();

  expect([swept, keys.includes(keyID)]).toStrictEqual([[], true]);
});

test('it keeps the removal counter of a connection after its removal began', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();
  const counter = await ctx.held.backend.remove(connection.tokenRef.credentialID);
  const read = await ctx.held.backend.readRemovalCounter(connection.tokenRef.credentialID);

  expect([counter, read]).toStrictEqual([1, 1]);
});

test('it reads no token of a connection whose removal began, except for its revocation', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();

  await ctx.held.backend.remove(connection.tokenRef.credentialID);

  const read = await ctx.held.backend.readToken(connection.tokenRef.credentialID);
  const revocable = await ctx.held.backend.readTokenForRevocation(connection.tokenRef.credentialID);

  expect([read, revocable?.refreshToken === 'fake-refresh-token-1']).toStrictEqual([null, true]);
});

test('it drops the secret and the key of a client that is removed', async () => {
  const ctx = await setupTest();
  const connection = await ctx.seedConnection();
  const keysBefore = await ctx.readKeyIDs();

  await ctx.held.backend.remove(connection.clientRef.credentialID);

  const client = await ctx.held.backend.readClient(connection.clientRef.credentialID);
  const keysAfter = await ctx.readKeyIDs();

  expect([client, keysBefore.length - keysAfter.length]).toStrictEqual([null, 1]);
});
