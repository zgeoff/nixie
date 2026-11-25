import { expect, test } from 'bun:test';
import { callTurnTimedCodec } from './call-turn-timed-codec';

test('it round-trips its payload', () => {
  const payload = {
    callID: 'c1',
    handOffID: 'h1',
    firstAudioMs: 900,
    handOffWaitMs: 1200,
    cutOffByLayer: false,
    interruptedByYou: true,
  };

  expect(callTurnTimedCodec.decode(callTurnTimedCodec.encode(payload))).toStrictEqual(payload);
});
