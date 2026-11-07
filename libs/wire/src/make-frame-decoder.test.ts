import { expect, test } from 'bun:test';
import { encodeFrame } from './encode-frame';
import { FrameTooLargeError } from './frame-too-large-error';
import { makeFrameDecoder } from './make-frame-decoder';
import { measureChunkedDecode } from './test-utils/measure-chunked-decode';

test('it returns each message whole when the transport splits and joins frames', () => {
  const decode = makeFrameDecoder(64);

  const stream = new Uint8Array([
    ...encodeFrame(new TextEncoder().encode('first')),
    ...encodeFrame(new TextEncoder().encode('')),
    ...encodeFrame(new TextEncoder().encode('third message')),
  ]);

  const messages = [stream.slice(0, 3), stream.slice(3, 11), stream.slice(11)].flatMap((chunk) =>
    decode(chunk).map((message) => new TextDecoder().decode(message)),
  );

  expect(messages).toStrictEqual(['first', '', 'third message']);
});

test('it refuses a frame past the limit at its header', () => {
  const decode = makeFrameDecoder(4);
  const header = encodeFrame(new TextEncoder().encode('too long')).slice(0, 4);

  expect(() => decode(header)).toThrow(new FrameTooLargeError(8, 4));
});

test('it keeps a partial frame until the rest arrives', () => {
  const decode = makeFrameDecoder(64);
  const frame = encodeFrame(new TextEncoder().encode('whole'));

  expect(decode(frame.slice(0, 6))).toStrictEqual([]);

  expect(decode(frame.slice(6)).map((message) => new TextDecoder().decode(message))).toStrictEqual([
    'whole',
  ]);
});

test('it decodes a 90 MiB frame sent in 64 KiB chunks at the time per byte of a 10 MiB frame', () => {
  const smallMessage = new Uint8Array(10 * 1024 * 1024).fill(7);
  const largeMessage = new Uint8Array(90 * 1024 * 1024).fill(7);

  // The fastest of 3 runs drops a run that garbage collection slowed. A decoder that copies its
  // whole buffer per chunk measured 6 to 14 times the time per byte here.
  const smallRuns = [1, 2, 3].map(() => measureChunkedDecode(smallMessage, 64 * 1024));
  const largeRuns = [1, 2, 3].map(() => measureChunkedDecode(largeMessage, 64 * 1024));

  expect(largeRuns[0]?.messages).toStrictEqual([largeMessage]);

  expect(
    Math.min(...largeRuns.map((run) => run.nsPerByte)) /
      Math.min(...smallRuns.map((run) => run.nsPerByte)),
  ).toBeLessThan(2);
});
