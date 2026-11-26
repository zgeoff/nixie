import { expect, test } from 'bun:test';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest() {
  const ctx = await startGoogleConnections();

  await ctx.connect('code-work');

  const [row] = await ctx.readRows();

  return { ...ctx, connectionID: row?.connection_id ?? '' };
}

test('#readStates lists a live connection with its status and the scopes it was granted', async () => {
  const ctx = await setupTest();
  const states = await ctx.connections.readStates();

  expect(states).toStrictEqual([
    {
      connectionID: ctx.connectionID,
      connection: expect.any(String),
      status: 'active',
      scopes: expect.arrayContaining(['gmail.modify']),
    },
  ]);
});

test('#readStates leaves out a connection that is forgotten', async () => {
  const ctx = await setupTest();
  const [listed] = await ctx.connections.list();

  await ctx.connections.forgetConnection(listed?.connection ?? '');

  const states = await ctx.connections.readStates();

  expect(states).toStrictEqual([]);
});
