import { expect, test } from 'bun:test';
import { callReconnectedCodec } from './call-reconnected-codec';

test('it round-trips its payload', () => {
  const payload = { callID: 'c1', cause: 'session_limit' } as const;

  expect(callReconnectedCodec.decode(callReconnectedCodec.encode(payload))).toStrictEqual(payload);
});
