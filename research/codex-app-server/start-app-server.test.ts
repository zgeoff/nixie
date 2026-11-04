import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { type AppServerProcess, startAppServer } from './start-app-server.ts';

function setupTest() {
  const written: string[] = [];
  const stdout = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stdout.writable.getWriter();
  const exited = Promise.withResolvers<number>();
  const child: AppServerProcess = {
    stdin: {
      write: (text) => written.push(text),
      end: () => undefined,
    },
    stdout: stdout.readable,
    stderr: new Response('').body ?? new ReadableStream(),
    exited: exited.promise,
    kill: () => {
      exited.resolve(143);
      writer.close().catch(() => undefined);
    },
  };

  return {
    child,
    exit: (exitCode: number) => {
      exited.resolve(exitCode);
    },
    writeStdout: (text: string) => writer.write(new TextEncoder().encode(text)),
    readSent: (): unknown[] =>
      written
        .join('')
        .split('\n')
        .filter((line) => line !== '')
        .map((line): unknown => JSON.parse(line)),
  };
}

test('it answers a token refresh request with the reply under the same ID', async () => {
  const ctx = setupTest();
  const starting = startAppServer(ctx.child, (method, params) => ({
    result: { answered: method, params, accessToken: 'token-from-client' },
  }));

  await ctx.writeStdout(`${JSON.stringify({ id: 1, result: {} })}\n`);
  const server = await starting;

  onTestFinished(() => server.stop());
  await ctx.writeStdout(
    `${JSON.stringify({
      id: 'refresh-1',
      method: 'account/chatgptAuthTokens/refresh',
      params: { reason: 'unauthorized', previousAccountId: 'acct-a' },
    })}\n`,
  );
  await waitForCondition(() => ctx.readSent().length === 3);

  expect(ctx.readSent()).toStrictEqual([
    { id: 1, method: 'initialize', params: expect.any(Object) },
    { method: 'initialized' },
    {
      id: 'refresh-1',
      result: {
        answered: 'account/chatgptAuthTokens/refresh',
        params: { reason: 'unauthorized', previousAccountId: 'acct-a' },
        accessToken: 'token-from-client',
      },
    },
  ]);
});

test('it fails an open request with the exit status when app-server exits', async () => {
  const ctx = setupTest();
  const starting = startAppServer(ctx.child, () => ({ result: null }));

  await ctx.writeStdout(`${JSON.stringify({ id: 1, result: {} })}\n`);
  const server = await starting;

  onTestFinished(() => server.stop());
  const request = server.request('thread/start', {});

  ctx.exit(1);

  expect(request).rejects.toThrow('codex app-server exited with status 1');
});

test('it fails the handshake with the exit status when app-server exits before it', async () => {
  const ctx = setupTest();
  const starting = startAppServer(ctx.child, () => ({ result: null }));

  ctx.exit(2);

  expect(starting).rejects.toThrow('codex app-server exited with status 2');
});

test('it fails an open request when stdout carries a line that is not JSON', async () => {
  const ctx = setupTest();
  const starting = startAppServer(ctx.child, () => ({ result: null }));

  await ctx.writeStdout(`${JSON.stringify({ id: 1, result: {} })}\n`);
  const server = await starting;

  onTestFinished(() => server.stop());
  const request = server.request('thread/start', {});

  await ctx.writeStdout('not json\n');

  expect(request).rejects.toThrow(/the app-server client failed on stdout/);
});
