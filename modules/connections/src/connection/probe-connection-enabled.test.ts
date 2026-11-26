import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startGoogleConnections } from '../test-utils/start-google-connections';
import { probeConnectionEnabled } from './probe-connection-enabled';

async function setupTest() {
  const ctx = await startGoogleConnections();

  await ctx.connect('code-work');

  const [row] = await ctx.readRows();

  return {
    ...ctx,
    connectionID: row?.connection_id ?? '',
    probe: (connectionID: string) =>
      withWriteTransaction(ctx.log.writer, (tx) => probeConnectionEnabled(tx, connectionID)),
  };
}

test('#probeConnectionEnabled finds a live connection enabled', async () => {
  const ctx = await setupTest();
  const isEnabled = await ctx.probe(ctx.connectionID);

  expect(isEnabled).toBe(true);
});

test('#probeConnectionEnabled finds a connection whose forget began disabled', async () => {
  const ctx = await setupTest();
  const [listed] = await ctx.connections.list();

  await ctx.connections.forgetConnection(listed?.connection ?? '');

  const isEnabled = await ctx.probe(ctx.connectionID);

  expect(isEnabled).toBe(false);
});

test('#probeConnectionEnabled finds an unknown connection disabled', async () => {
  const ctx = await setupTest();
  const isEnabled = await ctx.probe('no-such-connection');

  expect(isEnabled).toBe(false);
});
