import { expect, test } from 'bun:test';
import type { AttentionConnection } from '@heynixie/connections';
import { buildConnectionStatus } from './build-connection-status';

function setupTest() {
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
  const ctx = setupTest();

  const line = await ctx.read([]);

  expect(line).toStrictEqual({ value: 0, text: '' });
});

test('it reads the connections that need attention in the zone of the newest message, and counts them', async () => {
  const ctx = setupTest();

  const line = await ctx.read([ctx.needsConsent]);

  expect(line.value).toBe(1);
  expect(line.text).toInclude('needs consent since Fri 20 Nov, 09:00, UTC');
});

test('it counts an expiring model credential beside the connections', async () => {
  const ctx = setupTest();

  const line = await ctx.read([ctx.needsConsent], {
    expiresAtMs: Date.parse('2026-12-01T12:00:00Z'),
  });

  expect(line.value).toBe(2);
  expect(line.text).toInclude('The model credential: expiring on Tue 1 Dec, 12:00, UTC.');
});

test('it lists an expiring model credential when no connection needs attention', async () => {
  const ctx = setupTest();

  const line = await ctx.read([], { expiresAtMs: Date.parse('2026-12-01T12:00:00Z') });

  expect(line.value).toBe(1);
});
