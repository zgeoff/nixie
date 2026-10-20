import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRunClient } from './start-run-client';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-run-client-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it sends the run token over the run socket', async () => {
  const ctx = await setupTest();

  const socketPath = join(ctx.directory, 'run.sock');
  const authorizations: (string | null)[] = [];

  const refuseRequest = (request: Request) => {
    authorizations.push(request.headers.get('authorization'));

    return new Response('refused', { status: 401 });
  };

  const server = Bun.serve({
    unix: socketPath,
    fetch: refuseRequest,
  });

  onTestFinished(() => server.stop(true));

  const refusal: unknown = await startRunClient({
    runID: 'run-1',
    token: 'secret-token',
    socketPath,
    target: { path: socketPath },
    startStep: () => ({ token: 'step-token', stop: () => Promise.resolve() }),
    stop: () => Promise.resolve(),
  }).catch((error: unknown) => error);

  expect(refusal).toBeInstanceOf(Error);
  expect(authorizations).toStrictEqual(['Bearer secret-token']);
});

test('it sends the token given in place of the run token', async () => {
  const ctx = await setupTest();

  const socketPath = join(ctx.directory, 'run.sock');
  const authorizations: (string | null)[] = [];

  const refuseRequest = (request: Request) => {
    authorizations.push(request.headers.get('authorization'));

    return new Response('refused', { status: 401 });
  };

  const server = Bun.serve({
    unix: socketPath,
    fetch: refuseRequest,
  });

  onTestFinished(() => server.stop(true));

  const refusal: unknown = await startRunClient(
    {
      runID: 'run-1',
      token: 'secret-token',
      socketPath,
      target: { path: socketPath },
      startStep: () => ({ token: 'step-token', stop: () => Promise.resolve() }),
      stop: () => Promise.resolve(),
    },
    'step-token',
  ).catch((error: unknown) => error);

  expect(refusal).toBeInstanceOf(Error);
  expect(authorizations).toStrictEqual(['Bearer step-token']);
});
