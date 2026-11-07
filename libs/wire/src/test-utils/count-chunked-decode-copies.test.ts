import { expect, test } from 'bun:test';
import { frameHeaderBytes } from '../frame-header-bytes';
import { countChunkedDecodeCopies } from './count-chunked-decode-copies';

test('it returns the message it sent in chunks, with the bytes the decoder copied', () => {
  const message = new TextEncoder().encode('sent three bytes at a time');

  expect(countChunkedDecodeCopies(message, 3)).toStrictEqual({
    messages: [message],
    copiedBytes: frameHeaderBytes + message.byteLength,
  });
});
