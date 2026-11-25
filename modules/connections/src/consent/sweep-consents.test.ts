import { expect, test } from 'bun:test';
import { removeKey } from '../backend/mint-key';
import { startGoogleConnections } from '../test-utils/start-google-connections';

test('it deletes a lapsed request with its key, and keeps one that has not lapsed', async () => {
  const ctx = await startGoogleConnections();
  const lapsing = await ctx.start('session-a');
  const keys = await ctx.countKeys();

  ctx.clock.advance(lapsing.expiresAt - ctx.clock.now() + 1);

  const kept = await ctx.start('session-a');
  const swept = await ctx.connections.sweepConsents();
  const rows = await ctx.readConsentRows();

  expect([swept.requests, rows.map((row) => row.consent_id), await ctx.countKeys()]).toStrictEqual([
    1,
    [kept.consentID],
    keys,
  ]);
});

test('it ends a consent credential that no finished consent claimed, and revokes its token', async () => {
  const ctx = await startGoogleConnections();

  ctx.hooks.afterTokenSaved = () => Promise.reject(new Error('crash after the exchange saved'));

  await Promise.allSettled([ctx.connect('code-work')]);

  ctx.hooks.afterTokenSaved = () => Promise.resolve();

  ctx.clock.advance(11 * 60 * 1000);

  const revokesBefore = ctx.countRequests('/revoke');

  const swept = await ctx.connections.sweepConsents();
  const listed = await ctx.connections.list();

  expect([swept.credentials, listed, ctx.countRequests('/revoke') - revokesBefore]).toStrictEqual([
    1,
    [],
    1,
  ]);
});

test('it deletes a request that has not lapsed but lost its key, so the client can be removed', async () => {
  const ctx = await startGoogleConnections();

  await ctx.start('session-a');

  const [request] = await ctx.readConsentRows();

  await removeKey(ctx.held.backend.shared, request?.key_id ?? '');

  const before = await ctx.connections.removeClient(ctx.client);
  const swept = await ctx.connections.sweepConsents();
  const after = await ctx.connections.removeClient(ctx.client);

  expect([before, swept.requests, after]).toStrictEqual([
    { kind: 'client_in_use' },
    1,
    { kind: 'ok' },
  ]);
});

test('it never revokes the token of an abandoned consent whose account a live connection reaches', async () => {
  const ctx = await startGoogleConnections();

  await ctx.connect('code-work');

  ctx.hooks.afterTokenSaved = () => Promise.reject(new Error('crash after the exchange saved'));

  await Promise.allSettled([ctx.connect('code-work')]);

  ctx.hooks.afterTokenSaved = () => Promise.resolve();

  ctx.clock.advance(11 * 60 * 1000);

  const revokesBefore = ctx.countRequests('/revoke');

  const swept = await ctx.connections.sweepConsents();
  const listed = await ctx.connections.list();

  expect([
    swept.credentials,
    listed.map((entry) => entry.status),
    ctx.countRequests('/revoke') - revokesBefore,
  ]).toStrictEqual([1, ['active'], 0]);
});
