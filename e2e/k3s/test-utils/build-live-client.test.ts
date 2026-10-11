import { expect, onTestFinished, test } from 'bun:test';
import { ORPCError, implement } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { contract } from '../../../libs/contract/src/index';
import { buildLiveClient } from './build-live-client';

// A server on loopback that answers the contract's session list through oRPC's RPC handler under
// /rpc, as nixie's API does, and records the headers of each call.
function setupTest() {
  const os = implement(contract);
  const handler = new RPCHandler({
    sessions: {
      list: os.sessions.list.handler(() => {
        throw new ORPCError('UNAUTHORIZED');
      }),
    },
  });
  const calls: { path: string; client: string | null; authorization: string | null }[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      calls.push({
        path: new URL(request.url).pathname,
        client: request.headers.get('x-nixie-client'),
        authorization: request.headers.get('authorization'),
      });
      const result = await handler.handle(request, { prefix: '/rpc' });

      return result.matched ? result.response : new Response('not found', { status: 404 });
    },
  });

  onTestFinished(() => server.stop(true));

  return { calls, url: `http://127.0.0.1:${server.port}` };
}

test('it calls the API under /rpc with the client header and the bearer token', async () => {
  const ctx = setupTest();

  const call = buildLiveClient(`${ctx.url}/`, 'session-token').sessions.list();

  await expect(call).toReject();
  expect(ctx.calls).toStrictEqual([
    {
      path: '/rpc/sessions/list',
      client: 'live-check',
      authorization: 'Bearer session-token',
    },
  ]);
});

test('it sends no authorization header before enrolment', async () => {
  const ctx = setupTest();

  const call = buildLiveClient(ctx.url, null).sessions.list();

  await expect(call).toReject();
  expect(ctx.calls).toStrictEqual([
    { path: '/rpc/sessions/list', client: 'live-check', authorization: null },
  ]);
});

test('it rejects with the code the API answers', () => {
  const ctx = setupTest();

  expect(buildLiveClient(ctx.url, 'session-token').sessions.list()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});
