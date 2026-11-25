import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGoogleConnections } from '../test-utils/start-google-connections';

test('it removes a client that nothing uses, and deletes its key and secret', async () => {
  const ctx = await startGoogleConnections();
  const keys = await ctx.countKeys();
  const result = await ctx.connections.removeClient(ctx.client);
  const [clientID] = await ctx.readClientIDs();
  const row = await ctx.readClientRow(clientID ?? '');
  const setup = await ctx.connections.readSetup('https://nixie.example.org');

  expect([result, row?.secret_sealed, await ctx.countKeys(), setup.client]).toStrictEqual([
    { kind: 'ok' },
    null,
    keys - 1,
    null,
  ]);
});

test('it refuses to remove a client that a connection uses', async () => {
  const ctx = await startGoogleConnections();

  await ctx.connect('code-work');

  const result = await ctx.connections.removeClient(ctx.client);

  expect(result).toStrictEqual({ kind: 'client_in_use' });
});

test('it removes the client of a forgotten connection', async () => {
  const ctx = await startGoogleConnections();
  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  await ctx.connections.forgetConnection(connected.connection);

  const result = await ctx.connections.removeClient(ctx.client);

  expect(result).toStrictEqual({ kind: 'ok' });
});

test('it refuses to remove a client while a consent request that has not lapsed names it', async () => {
  const ctx = await startGoogleConnections();

  await ctx.start('session-a');

  const result = await ctx.connections.removeClient(ctx.client);

  expect(result).toStrictEqual({ kind: 'client_in_use' });
});

test('it removes a client whose consent request lapsed, and refuses the state after', async () => {
  const ctx = await startGoogleConnections();
  const started = await ctx.start('session-a');

  ctx.clock.advance(started.expiresAt - ctx.clock.now() + 1);

  const result = await ctx.connections.removeClient(ctx.client);
  const finished = await ctx.finish('session-a', started.state);

  expect([result, finished]).toStrictEqual([{ kind: 'ok' }, { kind: 'consent_not_found' }]);
});

test('it answers an unknown client', async () => {
  const ctx = await startGoogleConnections();
  const result = await ctx.connections.removeClient('unknownclient');

  expect(result).toStrictEqual({ kind: 'client_not_found' });
});

test('it records the removal with the short ID of the client', async () => {
  const ctx = await startGoogleConnections();

  await ctx.connections.removeClient(ctx.client);

  const records = await ctx.readRecordPayloads('connection.client_removed');

  expect(records).toStrictEqual([{ client: ctx.client }]);
});
