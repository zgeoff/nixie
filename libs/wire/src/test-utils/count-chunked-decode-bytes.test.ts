import { expect, onTestFinished, test } from 'bun:test';
import { frameHeaderBytes } from '../frame-header-bytes';
import { buildPrototypelessUint8Array } from './build-prototypeless-uint8-array';
import { countChunkedDecodeBytes } from './count-chunked-decode-bytes';

test('it returns the message it sent in chunks, with the bytes the decoder allocated and copied', () => {
  const message = new TextEncoder().encode('sent three bytes at a time');

  expect(countChunkedDecodeBytes(message, 3)).toStrictEqual({
    messages: [message],
    allocatedBytes: message.byteLength,
    copiedBytes: frameHeaderBytes + message.byteLength,
  });
});

test('it leaves the global Uint8Array as it found it', () => {
  const before = globalThis.Uint8Array;

  countChunkedDecodeBytes(new TextEncoder().encode('one'), 1);

  expect(globalThis.Uint8Array).toBe(before);
});

test('it leaves the global Uint8Array as it found it when a spy cannot install', () => {
  const real = globalThis.Uint8Array;
  const standIn = buildPrototypelessUint8Array(real);

  globalThis.Uint8Array = standIn;

  onTestFinished(() => {
    globalThis.Uint8Array = real;
  });

  expect(() => countChunkedDecodeBytes(new TextEncoder().encode('one'), 1)).toThrow();
  expect(globalThis.Uint8Array).toBe(standIn);
});
