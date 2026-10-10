import { expect, test } from 'bun:test';
import { encodeFrame } from './encode-frame';
import { FrameTooLargeError } from './frame-too-large-error';
import { makeFrameDecoder } from './make-frame-decoder';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

test('it returns each message whole when the transport splits and joins frames', () => {
  const decode = makeFrameDecoder(64);
  const stream = new Uint8Array([
    ...encodeFrame(encoder.encode('first')),
    ...encodeFrame(encoder.encode('')),
    ...encodeFrame(encoder.encode('third message')),
  ]);
  const messages = [stream.slice(0, 3), stream.slice(3, 11), stream.slice(11)].flatMap((chunk) =>
    decode(chunk).map((message) => decoder.decode(message)),
  );

  expect(messages).toStrictEqual(['first', '', 'third message']);
});

test('it refuses a frame past the limit at its header', () => {
  const decode = makeFrameDecoder(4);
  const header = encodeFrame(encoder.encode('too long')).slice(0, 4);

  expect(() => decode(header)).toThrow(new FrameTooLargeError(8, 4));
});

test('it keeps a partial frame until the rest arrives', () => {
  const decode = makeFrameDecoder(64);
  const frame = encodeFrame(encoder.encode('whole'));

  expect(decode(frame.slice(0, 6))).toStrictEqual([]);
  expect(decode(frame.slice(6)).map((message) => decoder.decode(message))).toStrictEqual(['whole']);
});
