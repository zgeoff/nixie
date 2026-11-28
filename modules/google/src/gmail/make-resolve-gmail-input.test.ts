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
    resolve: (input: Record<string, string | string[]>, pinned?: readonly string[]) =>
      resolve(input, {
        ...(pinned === undefined ? {} : { pinned }),
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
    message: '{"origin":"nixie","kind":"connection_unavailable"}',
    failure: { code: 'connection_unavailable' },
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

test('it names the one pinned connection when two are live and the call names none', async () => {
  const ctx = setupTest(['workmail', 'homemail']);

  const outcome = await ctx.resolve({ query: 'x' }, ['workmail']);

  expect(outcome).toStrictEqual({ status: 'ok', input: { query: 'x', connection: 'workmail' } });
});

test('it refuses a connection argument outside the pins', async () => {
  const ctx = setupTest(['workmail', 'homemail']);

  const outcome = await ctx.resolve({ query: 'x', connection: 'homemail' }, ['workmail']);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'NOT_PINNED: this task may use only these connections: workmail',
  });
});

test('it refuses an item of a connection outside the pins', async () => {
  const ctx = setupTest(['workmail', 'homemail']);

  const outcome = await ctx.resolve({ message: 'homemail.18c2f0' }, ['workmail']);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'NOT_PINNED: this task may use only these connections: workmail',
  });
});

test('it asks for the connection when several pinned connections are live', async () => {
  const ctx = setupTest(['workmail', 'homemail', 'clubmail']);

  const outcome = await ctx.resolve({ query: 'x' }, ['workmail', 'homemail']);

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'CONNECTION_REQUIRED: name one of these in the connection argument: workmail (workmail@example.test), homemail (homemail@example.test)',
  });
});

test('it refuses a call when every pinned connection is forgotten', async () => {
  const ctx = setupTest(['homemail']);

  const outcome = await ctx.resolve({ query: 'x' }, ['gone']);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'NO_CONNECTION: no Google account is connected',
  });
});
