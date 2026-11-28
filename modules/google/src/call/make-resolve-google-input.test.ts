import { expect, test } from 'bun:test';
import type { ConnectorContext } from '@heynixie/connections';
import { makeResolveGoogleInput } from './make-resolve-google-input';

function setupTest(live: readonly string[]) {
  const answerNothing = () => Promise.resolve(new Response(live.join(',')));

  const resolve = makeResolveGoogleInput(
    {
      readLiveContexts: (wanted) =>
        Promise.resolve(
          live
            .filter((connection) => wanted === undefined || wanted === connection)
            .map((connection): ConnectorContext => ({
              connectionID: `${connection}-id`,
              connection,
              account: `${connection}@example.test`,
              fetch: answerNothing,
            })),
        ),
      readPolledConnections: () => Promise.resolve(live),
      probeLive: () => Promise.resolve(true),
    },
    ['event'],
  );

  return {
    resolve: (input: Record<string, string>, pinned?: readonly string[]) =>
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

test('it refuses a call when no Google account is connected', async () => {
  const ctx = setupTest([]);

  const outcome = await ctx.resolve({ calendar: 'x' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'NO_CONNECTION: no Google account is connected',
  });
});

test('it ends a call as connection_unavailable when every pinned connection is forgotten', async () => {
  const ctx = setupTest(['homemail']);

  const outcome = await ctx.resolve({ calendar: 'x' }, ['gone']);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: '{"origin":"nixie","kind":"connection_unavailable"}',
    failure: { code: 'connection_unavailable' },
  });
});
