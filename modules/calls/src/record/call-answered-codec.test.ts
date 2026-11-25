import { expect, test } from 'bun:test';
import { callAnsweredCodec } from './call-answered-codec';

test('it round-trips its payload', () => {
  const payload = { callID: 'c1', carryingSession: 'i1' };

  expect(callAnsweredCodec.decode(callAnsweredCodec.encode(payload))).toStrictEqual(payload);
});
