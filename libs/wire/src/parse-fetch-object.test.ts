import { expect, test } from 'bun:test';
import { parseFetchObject } from './parse-fetch-object';

test('it returns the object the bytes hold', () => {
  expect(parseFetchObject(new TextEncoder().encode('{"kind":"failed"}'), 'reply')).toStrictEqual({
    kind: 'failed',
  });
});

test('it refuses a JSON value that is not an object', () => {
  expect(() => parseFetchObject(new TextEncoder().encode('[1]'), 'request')).toThrowWithMessage(
    TypeError,
    'a fetch request must be a JSON object',
  );
});

test('it refuses bytes that are not UTF-8', () => {
  expect(() => parseFetchObject(new Uint8Array([0xff, 0xfe]), 'reply')).toThrow();
});

test('it refuses bytes that are not JSON', () => {
  expect(() => parseFetchObject(new TextEncoder().encode('not json'), 'reply')).toThrow(
    SyntaxError,
  );
});
