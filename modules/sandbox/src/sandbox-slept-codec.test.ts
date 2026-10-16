import { expect, test } from 'bun:test';
import { sandboxSleptCodec } from './sandbox-slept-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = sandboxSleptCodec.encode({ sandboxID: 'sandbox-1' });

  expect(sandboxSleptCodec.decode(payload)).toStrictEqual({ sandboxID: 'sandbox-1' });
});

test('it refuses a payload that names no sandbox', () => {
  expect(() => sandboxSleptCodec.decode({})).toThrow(/"sandboxID"/u);
});
