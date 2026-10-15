import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeHostResponder } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import { buildHostClient } from './build-host-client';
import { startControlSocket } from './start-control-socket';

// a control socket that serves the host procedures over the API's context, as the server opens it
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const api = await startTestAPI();

  const path = join(dir, 'control.sock');

  const socket = await startControlSocket({
    path,
    respond: makeHostResponder({
      context: api.context,
      readMemory: () => null,
      runReset: () => Promise.reject(new Error('no reset runs in this test')),
    }),
  });

  onTestFinished(() => socket.stop());

  return { path };
}

test('it calls a host procedure through the socket, and decodes its dates', async () => {
  const ctx = await setupTest();
  const issued = await buildHostClient(ctx.path).sessions.issueCode();

  expect(issued).toStrictEqual({
    code: expect.toBeString(),
    expiresAt: new Date(1_000_000 + 15 * 60 * 1000),
  });
});
