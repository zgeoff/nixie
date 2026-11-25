import { expect, test } from 'bun:test';
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
