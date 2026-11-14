import { expect, test } from 'bun:test';
import { sandboxWokenCodec } from './sandbox-woken-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = sandboxWokenCodec.encode({ sandboxID: 'sandbox-1' });

  expect(sandboxWokenCodec.decode(payload)).toStrictEqual({ sandboxID: 'sandbox-1' });
});

test('it refuses a payload that names no sandbox', () => {
  expect(() => sandboxWokenCodec.decode({})).toThrow(/"sandboxID"/u);
});
