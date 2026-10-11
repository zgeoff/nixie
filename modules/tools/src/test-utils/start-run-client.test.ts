import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRunClient } from './start-run-client';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-run-client-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it sends the run token over the run socket', async () => {
  const ctx = await setupTest();
  const socketPath = join(ctx.dir, 'run.sock');
  const authorizations: (string | null)[] = [];
  const server = Bun.serve({
    unix: socketPath,
    fetch: (request) => {
      authorizations.push(request.headers.get('authorization'));
      return new Response('refused', { status: 401 });
    },
  });

  onTestFinished(() => server.stop(true));

  const refusal: unknown = await startRunClient({
    runID: 'run-1',
    token: 'secret-token',
    socketPath,
    target: { path: socketPath },
    stop: () => Promise.resolve(),
  }).catch((error: unknown) => error);

  expect(refusal).toBeInstanceOf(Error);
  expect(authorizations).toStrictEqual(['Bearer secret-token']);
});
