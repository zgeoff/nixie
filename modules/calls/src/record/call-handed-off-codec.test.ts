import { expect, test } from 'bun:test';
import { callHandedOffCodec } from './call-handed-off-codec';

test('it round-trips its payload', () => {
  const payload = { callID: 'c1', handOffID: 'h1' };

  expect(callHandedOffCodec.decode(callHandedOffCodec.encode(payload))).toStrictEqual(payload);
});
