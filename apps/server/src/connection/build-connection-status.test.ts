import { expect, test } from 'bun:test';
import type { AttentionConnection } from '@heynixie/connections';
import { seedConnectionStatus, startGoogleConnections } from '@heynixie/connections/test-utils';
import invariant from 'tiny-invariant';
import { buildConnectionStatus } from './build-connection-status';
import { pickModelCredentialExpiry } from './pick-model-credential-expiry';

async function setupTest() {
  const stored = await startGoogleConnections();
  const connected = await stored.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await stored.readRows();

  invariant(row, 'the connection is stored');

  const needsConsent: AttentionConnection = {
    connection: 'k3x9m2p7qa',
    connector: 'google',
    label: 'Work',
    account: 'sam@example.com',
    status: 'needs_consent',
    reason: null,
    sinceMs: Date.parse('2026-11-20T09:00:00Z'),
    lastSuccessAtMs: null,
    removedTools: ['gmail.search'],
  };

  return {
    ...stored,
    row,
    readStored: (credential: Parameters<typeof pickModelCredentialExpiry>[0]) =>
      buildConnectionStatus({
        readAttention: () => stored.connections.readAttention(),
        readModelCredential: () =>
          Promise.resolve(pickModelCredentialExpiry(credential, stored.clock.now())),
      }).read({
        start: { kind: 'first' },
        openedAt: new Date(stored.clock.now()),
        zone: 'UTC',
        times: { defaultZone: 'UTC', now: new Date(stored.clock.now()) },
        model: 'claude-test-1',
      }),
    needsConsent,
    read: (
      connections: readonly AttentionConnection[],
      credential: { readonly expiresAtMs: number } | null = null,
    ) =>
      buildConnectionStatus({
        readAttention: () => Promise.resolve(connections),
        readModelCredential: () => Promise.resolve(credential),
      }).read({
        start: { kind: 'first' },
        openedAt: new Date('2026-11-21T10:00:00Z'),
        zone: 'UTC',
        times: { defaultZone: 'Australia/Sydney', now: new Date('2026-11-21T10:00:00Z') },
        model: 'claude-test-1',
      }),
  };
}

test('it reads an empty line while every connection is active, so the status shows nothing', async () => {
  const ctx = await setupTest();
  const line = await ctx.read([]);

  expect(line).toStrictEqual({ value: 0, text: '' });
});

test('it reads the connections that need attention in the zone of the newest message, and counts them', async () => {
  const ctx = await setupTest();
  const line = await ctx.read([ctx.needsConsent]);

  expect(line.value).toBe(1);
  expect(line.text).toInclude('needs consent since Fri 20 Nov, 09:00, UTC');
});

test('it counts an expiring model credential beside the connections', async () => {
  const ctx = await setupTest();

  const line = await ctx.read([ctx.needsConsent], {
    expiresAtMs: Date.parse('2026-12-01T12:00:00Z'),
  });

  expect(line.value).toBe(2);
  expect(line.text).toInclude('The model credential: expiring on Tue 1 Dec, 12:00, UTC.');
});

test('it lists an expiring model credential when no connection needs attention', async () => {
  const ctx = await setupTest();
  const line = await ctx.read([], { expiresAtMs: Date.parse('2026-12-01T12:00:00Z') });

  expect(line.value).toBe(1);
});

test('it opens a session with the line of a connection that the store marked failing', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, {
    status: 'failing',
    reason: 'no_answer',
  });

  const line = await ctx.readStored(undefined);

  expect(line.text).toInclude(
    'google connection "work@example.test" (work@example.test): failing (no_answer)',
  );
});

test('it tells the model that the credential expires once the warning time begins, with no connection broken', async () => {
  const ctx = await setupTest();

  const line = await ctx.readStored({
    expires_at: new Date(ctx.clock.now() + 2 * 86_400_000).toISOString(),
    warn_before: 3 * 86_400_000,
  });

  expect([line.value, line.text]).toStrictEqual([
    1,
    expect.stringContaining('The model credential: expiring on'),
  ]);
});

test('it tells the model nothing of a credential that is more than the warning time from its end', async () => {
  const ctx = await setupTest();

  const line = await ctx.readStored({
    expires_at: new Date(ctx.clock.now() + 10 * 86_400_000).toISOString(),
    warn_before: 3 * 86_400_000,
  });

  expect(line).toStrictEqual({ value: 0, text: '' });
});
