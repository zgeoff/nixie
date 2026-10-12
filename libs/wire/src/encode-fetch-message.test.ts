import { expect, test } from 'bun:test';
import { encodeFetchMessage } from './encode-fetch-message';

const decoder = new TextDecoder();

test('it writes the message as one line of JSON', () => {
  const bytes = encodeFetchMessage({
    kind: 'page',
    url: 'https://example.com/',
    status: 200,
    contentType: 'text/plain',
    text: 'a\nb',
    isTruncated: false,
    blocked: null,
  });

  expect(decoder.decode(bytes)).toBe(
    String.raw`{"kind":"page","url":"https://example.com/","status":200,"contentType":"text/plain","text":"a\nb","isTruncated":false,"blocked":null}`,
  );
});
