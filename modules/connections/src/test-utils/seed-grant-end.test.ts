import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { seedGrantEnd } from './seed-grant-end';
import { startGoogleConnections } from './start-google-connections';

test('it sets the time the grant of a connection ends', async () => {
  const ctx = await startGoogleConnections();
  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await ctx.readRows();

  invariant(row, 'the connection is stored');

  await seedGrantEnd(ctx, row.connection_id, 1_800_000_000_000);

  const [changed] = await ctx.readRows();

  expect(changed?.refresh_expires_at).toBe(1_800_000_000_000);
});
