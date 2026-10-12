import { expect, test } from 'bun:test';
import { decodeFetchReply } from './decode-fetch-reply';

const encoder = new TextEncoder();

test('it returns a page with its text', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      kind: 'page',
      url: 'https://example.com/',
      status: 200,
      contentType: 'text/html',
      text: 'Example Domain',
      isTruncated: false,
    }),
  );

  expect(decodeFetchReply(bytes)).toStrictEqual({
    kind: 'page',
    url: 'https://example.com/',
    status: 200,
    contentType: 'text/html',
    text: 'Example Domain',
    isTruncated: false,
  });
});

test('it returns a binary page with no text', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      kind: 'page',
      url: 'https://example.com/a.png',
      status: 200,
      contentType: null,
      text: null,
      isTruncated: false,
    }),
  );

  expect(decodeFetchReply(bytes)).toStrictEqual({
    kind: 'page',
    url: 'https://example.com/a.png',
    status: 200,
    contentType: null,
    text: null,
    isTruncated: false,
  });
});

test('it returns a refusal with its reason', () => {
  const bytes = encoder.encode(
    JSON.stringify({ kind: 'refused', reason: 'only https URLs are fetched' }),
  );

  expect(decodeFetchReply(bytes)).toStrictEqual({
    kind: 'refused',
    reason: 'only https URLs are fetched',
  });
});

test('it drops a field that a well-formed reply does not hold', () => {
  const bytes = encoder.encode(JSON.stringify({ kind: 'failed', reason: 'timeout', extra: 'x' }));

  expect(decodeFetchReply(bytes)).toStrictEqual({ kind: 'failed', reason: 'timeout' });
});

test('it refuses a reply of an unknown kind', () => {
  const bytes = encoder.encode(JSON.stringify({ kind: 'other', reason: 'x' }));

  expect(() => decodeFetchReply(bytes)).toThrowWithMessage(TypeError, /kind of page/u);
});

test('it refuses a page whose status is out of range', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      kind: 'page',
      url: 'https://example.com/',
      status: 99,
      contentType: 'text/plain',
      text: 'x',
      isTruncated: false,
    }),
  );

  expect(() => decodeFetchReply(bytes)).toThrowWithMessage(TypeError, /status/u);
});

test('it refuses a page whose truncated mark is not a boolean', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      kind: 'page',
      url: 'https://example.com/',
      status: 200,
      contentType: 'text/plain',
      text: 'x',
      isTruncated: 'no',
    }),
  );

  expect(() => decodeFetchReply(bytes)).toThrowWithMessage(TypeError, /isTruncated/u);
});

test('it refuses a page whose text is not a string or null', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      kind: 'page',
      url: 'https://example.com/',
      status: 200,
      contentType: 'text/plain',
      text: 5,
      isTruncated: false,
    }),
  );

  expect(() => decodeFetchReply(bytes)).toThrowWithMessage(TypeError, /text, a string or null/u);
});

test('it refuses a page with no url', () => {
  const bytes = encoder.encode(
    JSON.stringify({
      kind: 'page',
      status: 200,
      contentType: 'text/plain',
      text: 'x',
      isTruncated: false,
    }),
  );

  expect(() => decodeFetchReply(bytes)).toThrowWithMessage(TypeError, /url, a string/u);
});
