import { expect, test } from 'bun:test';
import { encodeFrame } from './encode-frame';
import { FrameTooLargeError } from './frame-too-large-error';
import { makeFrameDecoder } from './make-frame-decoder';

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
