import { expect, test } from 'bun:test';
import type { ConnectorContext } from '@heynixie/connections';
import { makeResolveGmailInput } from './make-resolve-gmail-input';

function setupTest(live: readonly string[]) {
  const answerNothing = () => Promise.resolve(new Response(live.join(',')));

  const buildContext = (connection: string): ConnectorContext => ({
    connectionID: `${connection}-id`,
    connection,
    account: `${connection}@example.test`,
    fetch: answerNothing,
  });

  const resolve = makeResolveGmailInput({
    readLiveContexts: (wanted) =>
      Promise.resolve(
        live
          .filter((connection) => wanted === undefined || wanted === connection)
          .map((connection) => buildContext(connection)),
      ),
    readPolledConnections: () => Promise.resolve(live),
    probeLive: () => Promise.resolve(true),
  });

  return {
    resolve: (input: Record<string, string | string[]>) =>
      resolve(input, {
        run: {
          runID: 'run-1',
          thread: 'conversation',
          logThread: 'conversation',
          tools: [],
          model: { model: 'model-a', profile: 'chat-direct' },
        },
      }),
  };
}

test('it names the only live connection in the input', async () => {
  const ctx = setupTest(['workmail']);

  const outcome = await ctx.resolve({ query: 'x' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    input: { query: 'x', connection: 'workmail' },
  });
});

test('it takes the connection from the prefix of an item ID', async () => {
  const ctx = setupTest(['workmail', 'homemail']);

  const outcome = await ctx.resolve({ message: 'homemail.18c2f0' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    input: { message: 'homemail.18c2f0', connection: 'homemail' },
  });
});

test('it asks for the connection argument when 2 are live and the call names none', async () => {
  const ctx = setupTest(['workmail', 'homemail']);

  const outcome = await ctx.resolve({ query: 'x' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'CONNECTION_REQUIRED: name one of these in the connection argument: workmail (workmail@example.test), homemail (homemail@example.test)',
  });
});

test('it refuses threads of 2 connections', async () => {
  const ctx = setupTest(['workmail', 'homemail']);

  const outcome = await ctx.resolve({ threads: ['workmail.a1', 'homemail.b2'] });

  expect(outcome).toMatchObject({
    status: 'error',
    message: expect.stringContaining('mixed_connections'),
  });
});

test('it refuses an item ID that names a connection other than the argument', async () => {
  const ctx = setupTest(['workmail', 'homemail']);

  const outcome = await ctx.resolve({ message: 'workmail.a1', connection: 'homemail' });

  expect(outcome).toMatchObject({
    status: 'error',
    message: expect.stringContaining('mixed_connections'),
  });
});

test('it refuses an ID with no connection prefix', async () => {
  const ctx = setupTest(['workmail']);

  const outcome = await ctx.resolve({ message: '18c2f0' });

  expect(outcome).toMatchObject({
    status: 'error',
    message: expect.stringContaining('BAD_ITEM_ID'),
  });
});

test('it refuses a connection that is not live', async () => {
  const ctx = setupTest(['workmail']);

  const outcome = await ctx.resolve({ query: 'x', connection: 'gone' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'UNKNOWN_CONNECTION: no live connection has the ID gone',
  });
});

test('it refuses a call when no Google account is connected', async () => {
  const ctx = setupTest([]);

  const outcome = await ctx.resolve({ query: 'x' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'NO_CONNECTION: no Google account is connected',
  });
});
