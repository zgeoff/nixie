import { expect, test } from 'bun:test';
import { modelTurnEndedCodec } from './model-turn-ended-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = modelTurnEndedCodec.encode({
    model: 'claude-test-1',
    profile: 'chat-direct',
    stopReason: 'end_turn',
    terminalReason: 'completed',
    turns: 2,
    inputTokens: 1200,
    outputTokens: 80,
    cacheReadTokens: 900,
    cacheWriteTokens: 300,
    contextSize: 2400,
    contextWindow: 200_000,
    pinnedCore: [{ itemID: 'item-1', version: 1 }],
    retrieved: [{ itemID: 'item-2', version: 3 }],
    invalidatedThrough: 0,
    sessionImageBytes: 0,
    sessionImageCount: 0,
    recalledThrough: 41,
    memoryNotedThrough: 40,
  });

  expect(modelTurnEndedCodec.decode(payload)).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    stopReason: 'end_turn',
    terminalReason: 'completed',
    turns: 2,
    inputTokens: 1200,
    outputTokens: 80,
    cacheReadTokens: 900,
    cacheWriteTokens: 300,
    contextSize: 2400,
    contextWindow: 200_000,
    pinnedCore: [{ itemID: 'item-1', version: 1 }],
    retrieved: [{ itemID: 'item-2', version: 3 }],
    invalidatedThrough: 0,
    sessionImageBytes: 0,
    sessionImageCount: 0,
    recalledThrough: 41,
    memoryNotedThrough: 40,
  });
});

test('it reads the context of a turn from before turns kept their memory', () => {
  expect(
    modelTurnEndedCodec.tryDecodePartial({
      model: 'claude-test-1',
      profile: 'chat-direct',
      stopReason: 'end_turn',
      contextSize: 2400,
      contextWindow: 200_000,
    }),
  ).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    stopReason: 'end_turn',
    contextSize: 2400,
    contextWindow: 200_000,
  });
});

test('it refuses a pinned item version below the first', () => {
  expect(() =>
    modelTurnEndedCodec.decode({
      model: 'claude-test-1',
      profile: 'chat-direct',
      stopReason: 'end_turn',
      turns: 2,
      inputTokens: 1200,
      outputTokens: 80,
      cacheReadTokens: 900,
      cacheWriteTokens: 300,
      pinnedCore: [{ itemID: 'item-1', version: 0 }],
      retrieved: [],
      invalidatedThrough: 0,
      sessionImageBytes: 0,
      sessionImageCount: 0,
    }),
  ).toThrow(/"path": \[\s+"pinnedCore",\s+0,\s+"version"\s+\]/u);
});
