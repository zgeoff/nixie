import { expect, test } from 'bun:test';
import { callHeardCutCodec } from './call-heard-cut-codec';

test('it round-trips its payload', () => {
  const payload = { callID: 'c1', handOffID: 'h1', replyRecordID: 'r1', heardChars: 40 };

  expect(callHeardCutCodec.decode(callHeardCutCodec.encode(payload))).toStrictEqual(payload);
});
