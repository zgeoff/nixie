import { expect, test } from 'bun:test';
import { callHandedOffCodec } from './call-handed-off-codec';

test('it round-trips its payload', () => {
  const payload = { callID: 'c1', handOffID: 'h1', shortID: 'k3vq8m2xpa' };

  expect(callHandedOffCodec.decode(callHandedOffCodec.encode(payload))).toStrictEqual(payload);
});
