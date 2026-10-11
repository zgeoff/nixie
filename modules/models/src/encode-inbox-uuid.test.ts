import { expect, test } from 'bun:test';
import { encodeInboxUUID } from './encode-inbox-uuid';

test('it encodes a record sequence as a uuid that holds it', () => {
  expect(encodeInboxUUID(42)).toBe('6e697869-0000-8000-8000-00000000002a');
});

test.each([0, -1, 1.5, 2 ** 48])('it refuses %d, which no inbox uuid holds', (sequence) => {
  expect(() => encodeInboxUUID(sequence)).toThrowWithMessage(
    Error,
    `no inbox uuid holds the sequence ${sequence}`,
  );
});
