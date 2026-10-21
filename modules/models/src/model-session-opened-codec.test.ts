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

test('it decodes the session key an opening keeps', () => {
  const payload = modelSessionOpenedCodec.encode({
    model: 'claude-test-1',
    profile: 'chat-direct',
    kind: 'first',
    reason: null,
    lostSessionID: null,
    summarySequence: null,
    recentRecords: 0,
    recentEvents: 0,
    recalledThrough: 0,
    status: {},
    personaHash: 'sha256:persona',
    policyHash: 'sha256:policy',
    sessionKey: '00000000-0000-4000-8000-000000000001',
  });

  expect(modelSessionOpenedCodec.decode(payload).sessionKey).toBe(
    '00000000-0000-4000-8000-000000000001',
  );
});

test('it refuses a session key that is not a UUID', () => {
  expect(() =>
    modelSessionOpenedCodec.decode({
      model: 'claude-test-1',
      profile: 'chat-direct',
      kind: 'first',
      reason: null,
      lostSessionID: null,
      summarySequence: null,
      recentRecords: 0,
      recentEvents: 0,
      recalledThrough: 0,
      status: {},
      personaHash: 'sha256:persona',
      policyHash: 'sha256:policy',
      sessionKey: 'session-1',
    }),
  ).toThrow(/"path": \[\s+"sessionKey"\s+\]/u);
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
