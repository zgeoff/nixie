import { expect, test } from 'bun:test';
import { decodeInboxUUID } from './decode-inbox-uuid';
import { encodeInboxUUID } from './encode-inbox-uuid';

test('it reads back the sequence an inbox uuid holds', () => {
  expect(decodeInboxUUID(encodeInboxUUID(281_474_976_710_655))).toBe(281_474_976_710_655);
});

test('it finds no sequence in a uuid the CLI made itself', () => {
  expect(decodeInboxUUID('7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001')).toBeNull();
});
