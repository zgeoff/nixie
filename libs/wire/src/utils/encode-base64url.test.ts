import { expect, test } from 'bun:test';
import { encodeBase64URL } from './encode-base64url';

test('it encodes bytes as unpadded URL-safe text', () => {
  expect(encodeBase64URL(Uint8Array.from([0xfb, 0xff, 0xfe, 0x01]))).toBe('-__-AQ');
});

test('it encodes no bytes as empty text', () => {
  expect(encodeBase64URL(new Uint8Array(0))).toBe('');
});
