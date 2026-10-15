import { expect, test } from 'bun:test';
import { FrameTooLargeError, encodeFrame } from '@heynixie/wire';
import { startExecStream } from './start-exec-stream';
import { buildStubProcessIO } from './test-utils/build-stub-process-io';

test('it reads each framed message, whatever the transport splits', async () => {
  const encoder = new TextEncoder();

  const frames = new Uint8Array([
    ...encodeFrame(encoder.encode('one')),
    ...encodeFrame(encoder.encode('two')),
  ]);

  const stub = buildStubProcessIO({ stdout: [frames.slice(0, 5), frames.slice(5)], stderr: [] });
  const stream = startExecStream(stub.io, 16);

  const messages = await Array.fromAsync(stream.messages);

  expect(messages.map((message) => new TextDecoder().decode(message))).toStrictEqual([
    'one',
    'two',
  ]);
});

test('it writes each sent message as one frame', async () => {
  const encoder = new TextEncoder();

  const stub = buildStubProcessIO({ stdout: [], stderr: [] });
  const stream = startExecStream(stub.io, 16);

  await stream.send(encoder.encode('hi'));

  expect(stub.written).toStrictEqual([encodeFrame(encoder.encode('hi'))]);
});

test('it resolves the exit with the stderr the process wrote', () => {
  const stub = buildStubProcessIO({ stdout: [], stderr: [new TextEncoder().encode('warn')] });
  const stream = startExecStream(stub.io, 16);

  stub.end({ code: 0, signal: null });

  expect(stream.exit).resolves.toStrictEqual({
    code: 0,
    signal: null,
    stderr: { bytes: new TextEncoder().encode('warn'), totalBytes: 4, isCut: false },
  });
});

test('it rejects the messages on a frame past the caller limit', () => {
  const stub = buildStubProcessIO({ stdout: [encodeFrame(new Uint8Array(17))], stderr: [] });
  const stream = startExecStream(stub.io, 16);

  expect(Array.fromAsync(stream.messages)).rejects.toThrow(new FrameTooLargeError(17, 16));
});

test('it stops the process on a frame past the caller limit', async () => {
  const stub = buildStubProcessIO({ stdout: [encodeFrame(new Uint8Array(17))], stderr: [] });
  const stream = startExecStream(stub.io, 16);

  await Array.fromAsync(stream.messages).catch(() => null);

  expect(stub.signals).toStrictEqual(['SIGTERM']);
  expect(stream.exit).resolves.toMatchObject({ code: null, signal: 'SIGTERM' });
});
