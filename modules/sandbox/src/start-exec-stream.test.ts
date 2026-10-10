import { expect, test } from 'bun:test';
import { FrameTooLargeError, encodeFrame } from '@heynixie/wire';
import { startExecStream } from './start-exec-stream';
import type { ExecExit, ExecStream } from './types';

const encoder = new TextEncoder();

function buildStream(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start: (controller) => {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

// A process whose stdout holds the given chunks and whose stderr holds 4 bytes. A stop ends it
// with SIGTERM.
function setupTestIO(stdoutChunks: readonly Uint8Array[]) {
  const written: Uint8Array[] = [];
  const stops: string[] = [];
  const exit = Promise.withResolvers<ExecExit>();
  const io = {
    stdout: buildStream(stdoutChunks),
    stderr: buildStream([encoder.encode('warn')]),
    write: (bytes: Uint8Array) => {
      written.push(bytes);
      return Promise.resolve();
    },
    closeStdin: () => Promise.resolve(),
    exit: exit.promise,
    stop: () => {
      stops.push('SIGTERM');
      exit.resolve({ code: null, signal: 'SIGTERM' });
    },
  };

  return { io, written, stops, exit };
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- an async iterable has no readonly form
async function collectMessages(stream: ExecStream): Promise<readonly string[]> {
  const texts: string[] = [];

  for await (const message of stream.messages) {
    texts.push(new TextDecoder().decode(message));
  }
  return texts;
}

test('it sends and reads framed messages, whatever the transport splits', async () => {
  const frames = new Uint8Array([
    ...encodeFrame(encoder.encode('one')),
    ...encodeFrame(encoder.encode('two')),
  ]);
  const ctx = setupTestIO([frames.slice(0, 5), frames.slice(5)]);
  const stream = startExecStream(ctx.io, 16);

  await stream.send(encoder.encode('hi'));

  const messages = await collectMessages(stream);

  ctx.exit.resolve({ code: 0, signal: null });

  expect(messages).toStrictEqual(['one', 'two']);
  expect(ctx.written).toStrictEqual([encodeFrame(encoder.encode('hi'))]);
  expect(stream.exit).resolves.toMatchObject({ code: 0, signal: null, stderr: { totalBytes: 4 } });
});

test('it stops the process on a message past the caller limit', () => {
  const ctx = setupTestIO([encodeFrame(new Uint8Array(17))]);
  const stream = startExecStream(ctx.io, 16);

  expect(collectMessages(stream)).rejects.toThrow(new FrameTooLargeError(17, 16));
  expect(stream.exit).resolves.toMatchObject({ code: null, signal: 'SIGTERM' });
  expect(ctx.stops).toStrictEqual(['SIGTERM']);
});
