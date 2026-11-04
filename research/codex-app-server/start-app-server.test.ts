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
    writeStdout: (text: string) => writer.write(new TextEncoder().encode(text)),
    readSent: (): unknown[] =>
      written
        .join('')
        .split('\n')
        .filter((line) => line !== '')
        .map((line): unknown => JSON.parse(line)),
  };
}

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
