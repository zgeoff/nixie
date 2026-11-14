import { expect, test } from 'bun:test';
import { parseBase64URL } from './parse-base64url';

test('it parses unpadded URL-safe text to its bytes', () => {
  expect(parseBase64URL('-__-AQ')).toStrictEqual(Uint8Array.from([0xfb, 0xff, 0xfe, 0x01]));
});

test('it parses empty text to no bytes', () => {
  expect(parseBase64URL('')).toStrictEqual(new Uint8Array(0));
});

test.each([
  ['padding', 'AQI='],
  ['a character outside the alphabet', 'AQ+/'],
  ['a length that no byte string has', 'AQIDB'],
  ['trailing bits that are not zero', 'AR'],
])('it returns null for %s', (_name, text) => {
  expect(parseBase64URL(text)).toBeNull();
});
