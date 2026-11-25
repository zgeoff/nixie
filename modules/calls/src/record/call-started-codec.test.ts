import { expect, test } from 'bun:test';
import { callStartedCodec } from './call-started-codec';

test('it round-trips its payload', () => {
  const payload = {
    callID: 'c1',
    taskID: 't1',
    startedBy: 'nixie',
    carryingSession: 'i1',
  } as const;

  expect(callStartedCodec.decode(callStartedCodec.encode(payload))).toStrictEqual(payload);
});
