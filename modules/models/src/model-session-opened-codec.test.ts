import { expect, test } from 'bun:test';
import { modelSessionOpenedCodec } from './model-session-opened-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = modelSessionOpenedCodec.encode({
    model: 'claude-test-1',
    profile: 'chat-direct',
    kind: 'rebuild',
    reason: 'lost',
    lostSessionID: 'session-1',
    summarySequence: 12,
    recentRecords: 8,
    recentEvents: 2,
    recalledThrough: 30,
    status: { time: '09:00', model: 'claude-test-1', items: 4 },
    personaHash: 'sha256:persona',
    policyHash: 'sha256:policy',
  });

  expect(modelSessionOpenedCodec.decode(payload)).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    kind: 'rebuild',
    reason: 'lost',
    lostSessionID: 'session-1',
    summarySequence: 12,
    recentRecords: 8,
    recentEvents: 2,
    recalledThrough: 30,
    status: { time: '09:00', model: 'claude-test-1', items: 4 },
    personaHash: 'sha256:persona',
    policyHash: 'sha256:policy',
  });
});

test('it reads an opening from before openings kept their persona hash', () => {
  expect(
    modelSessionOpenedCodec.tryDecodePartial({ kind: 'first', reason: null, recalledThrough: 0 }),
  ).toStrictEqual({ kind: 'first', reason: null, recalledThrough: 0 });
});

test('it refuses a start no session opens with', () => {
  expect(() =>
    modelSessionOpenedCodec.decode({
      model: 'claude-test-1',
      profile: 'chat-direct',
      kind: 'resume',
      reason: null,
      lostSessionID: null,
      summarySequence: null,
      recentRecords: 0,
      recentEvents: 0,
      recalledThrough: 0,
      status: {},
      personaHash: 'sha256:persona',
      policyHash: 'sha256:policy',
    }),
  ).toThrow(/"path": \[\s+"kind"\s+\]/u);
});
