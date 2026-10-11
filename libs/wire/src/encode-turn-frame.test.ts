import { expect, test } from 'bun:test';
import { encodeTurnFrame } from './encode-turn-frame';

test('it encodes a frame as its JSON bytes', () => {
  expect(
    new TextDecoder().decode(
      encodeTurnFrame({ type: 'read', uuids: ['6e697869-0000-8000-8000-000000000001'] }),
    ),
  ).toBe('{"type":"read","uuids":["6e697869-0000-8000-8000-000000000001"]}');
});
