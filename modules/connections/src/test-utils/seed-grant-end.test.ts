import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { seedGrantEnd } from './seed-grant-end';
import { startGoogleConnections } from './start-google-connections';

test('it gives a connection a grant that ends the given time from now, through a consent', async () => {
  const ctx = await startGoogleConnections();
  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await ctx.readRows();

  invariant(row, 'the connection is stored');

  await seedGrantEnd(ctx, row, 'code-work', 3_600_000);

  const [changed] = await ctx.readRows();

  expect(changed?.refresh_expires_at).toBe(ctx.clock.now() + 3_600_000);
});

test('it lets a later consent renew the connection with a grant of no limited time', async () => {
  const ctx = await startGoogleConnections();
  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await ctx.readRows();

  invariant(row, 'the connection is stored');

  await seedGrantEnd(ctx, row, 'code-work', 3_600_000);

  await ctx.connect('code-work', row.short_id);

  const [renewed] = await ctx.readRows();

  expect(renewed?.refresh_expires_at).toBeNull();
});
