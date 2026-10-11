import { expect, test } from 'bun:test';
import { deriveSecretHash } from './derive-secret-hash';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import type { APITables } from './types';
import { verifySessionToken } from './verify-session-token';
import { writeSessionRevocation } from './write-session-revocation';

async function setupTest() {
  const api = await startTestAPI();
  const db = api.writer.db.$extendTables<
    APITables & { records: { kind: string; payload: string; key_id: string | null } }
  >();

  return { ...api, db };
}

test('it resolves a live session to its row of the identity record', async () => {
  const ctx = await setupTest();

  const session = await createDeviceSession(ctx.context, 'laptop');

  const result = await verifySessionToken(ctx.context, session.token);

  expect(result).toStrictEqual({
    identityID: session.sessionID,
    channel: 'client',
    label: 'laptop',
    pairedAt: 1_000_000,
    lastSeenAt: 1_000_000,
  });
});

test('it refuses a revoked session', async () => {
  const ctx = await setupTest();

  const session = await createDeviceSession(ctx.context, 'laptop');
  const caller = await verifySessionToken(ctx.context, session.token);

  if (caller === null) {
    throw new Error('the session failed to resolve');
  }
  await writeSessionRevocation(ctx.context, caller, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: session.sessionID,
  });

  const result = await verifySessionToken(ctx.context, session.token);

  expect(result).toBeNull();
});

test('it refuses a session unused for more than 30 days', async () => {
  const ctx = await setupTest();

  const session = await createDeviceSession(ctx.context, 'laptop');

  ctx.clock.advance(30 * 24 * 60 * 60 * 1000 + 1);

  const result = await verifySessionToken(ctx.context, session.token);

  expect(result).toBeNull();
});

test('it keeps a session that is used within every 30 days', async () => {
  const ctx = await setupTest();

  const session = await createDeviceSession(ctx.context, 'laptop');

  ctx.clock.advance(20 * 24 * 60 * 60 * 1000);
  await verifySessionToken(ctx.context, session.token);
  ctx.clock.advance(20 * 24 * 60 * 60 * 1000);

  const result = await verifySessionToken(ctx.context, session.token);

  expect(result).toMatchObject({
    identityID: session.sessionID,
  });
});

test('it moves the last seen time at most once a minute', async () => {
  const ctx = await setupTest();

  const session = await createDeviceSession(ctx.context, 'laptop');

  ctx.clock.advance(30_000);
  await verifySessionToken(ctx.context, session.token);

  const row = await ctx.db
    .selectFrom('identities')
    .select('last_seen_at')
    .executeTakeFirstOrThrow();

  expect(row.last_seen_at).toBe(1_000_000);
});

test('it treats a call with no token as signed out and writes no refusal', async () => {
  const ctx = await setupTest();

  const caller = await verifySessionToken(ctx.context, undefined);
  const refusals = await ctx.db
    .selectFrom('records')
    .select('kind')
    .where('kind', '=', 'identity.refused')
    .execute();

  expect(caller).toBeNull();
  expect(refusals).toStrictEqual([]);
});

test('it writes a refusal for an unknown token under the token hash, never the token', async () => {
  const ctx = await setupTest();

  await verifySessionToken(ctx.context, 'a-token-nixie-never-issued');

  const refusals = await ctx.db
    .selectFrom('records')
    .select(['payload', 'key_id'])
    .where('kind', '=', 'identity.refused')
    .execute();

  expect(refusals).toStrictEqual([
    {
      payload: JSON.stringify({
        channel: 'client',
        externalID: deriveSecretHash('a-token-nixie-never-issued'),
        refusedAt: 1_000_000,
      }),
      key_id: null,
    },
  ]);
});

test('it writes a refusal for a revoked session under its session ID', async () => {
  const ctx = await setupTest();

  const session = await createDeviceSession(ctx.context, 'laptop');
  const caller = await verifySessionToken(ctx.context, session.token);

  if (caller === null) {
    throw new Error('the session failed to resolve');
  }
  await writeSessionRevocation(ctx.context, caller, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: session.sessionID,
  });
  await verifySessionToken(ctx.context, session.token);

  const refusals = await ctx.db
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', 'identity.refused')
    .execute();

  expect(refusals).toStrictEqual([
    {
      payload: JSON.stringify({
        channel: 'client',
        externalID: session.sessionID,
        refusedAt: 1_000_000,
      }),
    },
  ]);
});

test('it writes one refusal per external ID per hour', async () => {
  const ctx = await setupTest();

  await verifySessionToken(ctx.context, 'a-token-nixie-never-issued');
  ctx.clock.advance(59 * 60 * 1000);
  await verifySessionToken(ctx.context, 'a-token-nixie-never-issued');
  await verifySessionToken(ctx.context, 'another-token-nixie-never-issued');
  ctx.clock.advance(60 * 1000);
  await verifySessionToken(ctx.context, 'a-token-nixie-never-issued');

  const refusals = await ctx.db
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', 'identity.refused')
    .orderBy('sequence')
    .execute();

  expect(refusals.map((refusal) => JSON.parse(refusal.payload))).toStrictEqual([
    {
      channel: 'client',
      externalID: deriveSecretHash('a-token-nixie-never-issued'),
      refusedAt: 1_000_000,
    },
    {
      channel: 'client',
      externalID: deriveSecretHash('another-token-nixie-never-issued'),
      refusedAt: 1_000_000 + 59 * 60 * 1000,
    },
    {
      channel: 'client',
      externalID: deriveSecretHash('a-token-nixie-never-issued'),
      refusedAt: 1_000_000 + 60 * 60 * 1000,
    },
  ]);
});
