import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { implement } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { contract } from '../../../libs/contract/src/index';
import { createLiveSession } from './create-live-session';

// A stand-in API on loopback that answers enrolment and revoke through oRPC's RPC handler under
// /rpc, as nixie's API does, and records each call; and the kubectl stand-in, which prints a code
// for the enrol-code host command.
async function setupTest() {
  const os = implement(contract);
  const calls: { procedure: string; input: unknown }[] = [];
  const handler = new RPCHandler({
    sessions: {
      enrol: os.sessions.enrol.handler((options) => {
        calls.push({ procedure: 'enrol', input: options.input });
        return { sessionID: '0b9d4c1e-7f3a-4c2b-9a8e-5d6f7a8b9c0d', token: 'session-token' };
      }),
      revoke: os.sessions.revoke.handler((options) => {
        calls.push({ procedure: 'revoke', input: options.input });
        return { revokedAt: new Date(0) };
      }),
    },
  });
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: async (request) => {
      const result = await handler.handle(request, { prefix: '/rpc' });

      return result.matched ? result.response : new Response('not found', { status: 404 });
    },
  });

  onTestFinished(() => server.stop(true));

  const dir = await mkdtemp(join(tmpdir(), 'nixie-live-session-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  await writeFile(
    join(dir, 'replies.json'),
    JSON.stringify({ 'enrol-code': 'K7QX-P2MD\nThe code works once.\n' }),
  );

  return {
    calls,
    url: `http://127.0.0.1:${server.port}`,
    kubectl: {
      argv: [process.execPath, join(import.meta.dir, 'run-stub-kubectl.ts'), '--replies'],
      kubeconfig: '/tmp/kubeconfig',
      namespace: 'nixie',
    },
    replies: join(dir, 'replies.json'),
  };
}

test('it enrols a device with the code from the host command, as a bearer session', async () => {
  const ctx = await setupTest();

  const session = await createLiveSession(ctx.url, {
    ...ctx.kubectl,
    argv: [...ctx.kubectl.argv, ctx.replies],
  });

  expect(session.sessionID).toBe('0b9d4c1e-7f3a-4c2b-9a8e-5d6f7a8b9c0d');
  expect(ctx.calls).toStrictEqual([
    {
      procedure: 'enrol',
      input: {
        clientActionID: expect.any(String),
        code: 'K7QX-P2MD',
        deviceName: 'live check',
        tokenDelivery: 'bearer',
      },
    },
  ]);
});

test('it revokes the session it enrolled', async () => {
  const ctx = await setupTest();
  const session = await createLiveSession(ctx.url, {
    ...ctx.kubectl,
    argv: [...ctx.kubectl.argv, ctx.replies],
  });

  await session.revoke();

  expect(ctx.calls.at(-1)).toStrictEqual({
    procedure: 'revoke',
    input: {
      clientActionID: expect.any(String),
      sessionID: '0b9d4c1e-7f3a-4c2b-9a8e-5d6f7a8b9c0d',
    },
  });
});
