import { expect, test } from 'bun:test';
import { callRangCodec } from './call-rang-codec';

test('it round-trips its payload', () => {
  const payload = { callID: 'c1', deviceCount: 2 };

  expect(callRangCodec.decode(callRangCodec.encode(payload))).toStrictEqual(payload);
});
