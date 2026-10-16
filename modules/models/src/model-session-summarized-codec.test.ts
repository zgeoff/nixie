import { expect, test } from 'bun:test';
import { modelSessionSummarizedCodec } from './model-session-summarized-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = modelSessionSummarizedCodec.encode({
    model: 'claude-test-1',
    profile: 'chat-direct',
    throughSequence: 40,
    boundary: { sessionID: 'session-1', messageID: 'message-1' },
    trigger: 'threshold',
    contextSize: 150_000,
    summaryTokens: 1800,
    isCut: false,
  });

  expect(modelSessionSummarizedCodec.decode(payload)).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    throughSequence: 40,
    boundary: { sessionID: 'session-1', messageID: 'message-1' },
    trigger: 'threshold',
    contextSize: 150_000,
    summaryTokens: 1800,
    isCut: false,
  });
});

test('it refuses a summary whose size is not a whole number', () => {
  expect(() =>
    modelSessionSummarizedCodec.decode({
      model: 'claude-test-1',
      profile: 'chat-direct',
      throughSequence: 40,
      boundary: { sessionID: 'session-1', messageID: 'message-1' },
      trigger: 'overflow',
      summaryTokens: '1800',
      isCut: false,
    }),
  ).toThrow(/"path": \[\s+"summaryTokens"\s+\]/u);
});
