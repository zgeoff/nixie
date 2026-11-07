import { expect, test } from 'bun:test';
import { measureChunkedDecode } from './measure-chunked-decode';

test('it returns the message it sent in chunks, with the decode time per byte', () => {
  const message = new TextEncoder().encode('sent three bytes at a time');

  expect(measureChunkedDecode(message, 3)).toStrictEqual({
    messages: [message],
    nsPerByte: expect.toBeNumber(),
  });
});
