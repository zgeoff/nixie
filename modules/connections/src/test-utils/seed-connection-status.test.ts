import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { seedConnectionStatus } from './seed-connection-status';
import { startGoogleConnections } from './start-google-connections';

test('it puts a connection in the status and writes the store record of the change', async () => {
  const ctx = await startGoogleConnections();
  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await ctx.readRows();

  invariant(row, 'the connection is stored');

  await seedConnectionStatus(ctx, row.connection_id, { status: 'failing', reason: 'no_answer' });

  const [changed] = await ctx.readRows();
  const payloads = await ctx.readRecordPayloads('credential.status_changed');

  expect([changed?.status, changed?.status_reason, payloads]).toStrictEqual([
    'failing',
    'no_answer',
    [{ credentialID: row.connection_id, status: 'failing', reason: 'no_answer' }],
  ]);
});
