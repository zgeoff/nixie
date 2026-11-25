import { expect, test } from 'bun:test';
import { startConnectionsHarness } from '../test-utils/start-connections-harness';
import { startGoogleConnections } from '../test-utils/start-google-connections';

test('it asks for a client before it starts a consent', async () => {
  const ctx = await startConnectionsHarness();

  const result = await ctx.connections.startConsent({
    deviceSessionID: 'session-a',
    connection: null,
  });

  expect(result).toStrictEqual({ kind: 'client_missing' });
});

test('it answers an unknown connection for a consent again', async () => {
  const ctx = await startGoogleConnections();

  const result = await ctx.connections.startConsent({
    deviceSessionID: 'session-a',
    connection: 'unknownconn',
  });

  expect(result).toStrictEqual({ kind: 'connection_not_found' });
});

test('it builds the consent URL of the registered client with S256 and a state that is not kept', async () => {
  const ctx = await startGoogleConnections();
  const started = await ctx.start('session-a');
  const [row] = await ctx.readConsentRows();

  expect([
    started.url.searchParams.get('client_id'),
    started.url.searchParams.get('redirect_uri'),
    started.url.searchParams.get('code_challenge_method'),
    started.url.searchParams.get('prompt'),
    started.url.hostname,
    JSON.stringify(row).includes(started.state),
    started.expiresAt - ctx.clock.now(),
  ]).toStrictEqual([
    'client-123.apps.test',
    'https://nixie.example.org/connections/google/return',
    'S256',
    'consent',
    'accounts.test',
    false,
    10 * 60 * 1000,
  ]);
});

test('it gives a retry a fresh state that replaces the first, with the first expiry', async () => {
  const ctx = await startGoogleConnections();
  const first = await ctx.start('session-a');

  ctx.clock.advance(60_000);

  const retried = await ctx.connections.startConsent({
    deviceSessionID: 'session-a',
    connection: null,
    consentID: first.consentID,
  });

  if (retried.kind !== 'started') {
    throw new Error('the retry starts');
  }

  const state = new URL(retried.consentURL).searchParams.get('state') ?? '';

  const challenge = new URL(retried.consentURL).searchParams.get('code_challenge');

  const stale = await ctx.finish('session-a', first.state);
  const fresh = await ctx.finish('session-a', state);

  expect([
    retried.consentID === first.consentID,
    retried.expiresAt === first.expiresAt,
    state === first.state,
    challenge === first.challenge,
    stale.kind,
    fresh.kind,
  ]).toStrictEqual([true, true, false, true, 'consent_not_found', 'finished']);
});

test('it starts a consent again for a live connection', async () => {
  const ctx = await startGoogleConnections();
  const connected = await ctx.connect('code-work');

  const result = await ctx.connections.startConsent({
    deviceSessionID: 'session-a',
    connection: connected.kind === 'finished' ? connected.connection : '',
  });

  expect(result.kind).toBe('started');
});
