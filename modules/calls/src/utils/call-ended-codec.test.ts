import { expect, test } from 'bun:test';
import { callEndedCodec } from './call-ended-codec';

test('it round-trips its payload', () => {
  const payload = { callID: 'c1', endedBy: 'budget', minutes: 3 } as const;

  expect(callEndedCodec.decode(callEndedCodec.encode(payload))).toStrictEqual(payload);
});

test('it refuses an end that names no known cause', () => {
  expect(() => callEndedCodec.parse({ callID: 'c1', endedBy: 'weather', minutes: 1 })).toThrow();
});
