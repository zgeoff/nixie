import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startGoogleConnections } from '../test-utils/start-google-connections';
import { readLiveConnectionIDs } from './read-live-connection-ids';

async function setupTest() {
  const ctx = await startGoogleConnections();

  await ctx.connect('code-work');

  const [row] = await ctx.readRows();

  return {
    ...ctx,
    connectionID: row?.connection_id ?? '',
    readIDs: () => withWriteTransaction(ctx.log.writer, (tx) => readLiveConnectionIDs(tx)),
  };
}

test('#readLiveConnectionIDs lists the ID of a live connection', async () => {
  const ctx = await setupTest();
  const ids = await ctx.readIDs();

  expect(ids).toStrictEqual([ctx.connectionID]);
});

test('#readLiveConnectionIDs leaves out a connection whose forget began', async () => {
  const ctx = await setupTest();
  const [listed] = await ctx.connections.list();

  await ctx.connections.forgetConnection(listed?.connection ?? '');

  const ids = await ctx.readIDs();

  expect(ids).toStrictEqual([]);
});
