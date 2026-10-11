import { expect, test } from 'bun:test';
import { parseFetchObject } from './parse-fetch-object';

const encoder = new TextEncoder();

test('it returns the object the bytes hold', () => {
  expect(parseFetchObject(encoder.encode('{"kind":"failed"}'), 'reply')).toStrictEqual({
    kind: 'failed',
  });
});

test('it refuses a JSON value that is not an object', () => {
  expect(() => parseFetchObject(encoder.encode('[1]'), 'request')).toThrowWithMessage(
    TypeError,
    'a fetch request must be a JSON object',
  );
});

test('it refuses bytes that are not UTF-8', () => {
  expect(() => parseFetchObject(new Uint8Array([0xff, 0xfe]), 'reply')).toThrow();
});

test('it refuses bytes that are not JSON', () => {
  expect(() => parseFetchObject(encoder.encode('not json'), 'reply')).toThrow(SyntaxError);
});
