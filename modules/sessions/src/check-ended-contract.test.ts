import { expect, test } from 'bun:test';
import { bindHarness } from '@heynixie/models';
import { buildMockModelProfile, buildStubCodexHarness } from '@heynixie/models/test-utils';
import { checkEndedContract } from './check-ended-contract';

function setupTest() {
  return {
    agentSDK: bindHarness(buildMockModelProfile()),
    codex: buildStubCodexHarness(),
  };
}

test('it fails a guest that sends a session point from a harness with no session', () => {
  const ctx = setupTest();

  expect(() =>
    checkEndedContract(ctx.codex, {
      type: 'ended',
      outcome: 'finished',
      boundary: {
        harness: 'agent-sdk',
        sessionID: '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8',
        messageID: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      },
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }),
  ).toThrow('broke its contract: it sent a session point');
});

test('it fails a guest that ends with no session point on a harness with a session', () => {
  const ctx = setupTest();

  expect(() =>
    checkEndedContract(ctx.agentSDK, {
      type: 'ended',
      outcome: 'finished',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }),
  ).toThrow('broke its contract: it ended its turn with no session point');
});

test('it fails a guest that sends a context size from a harness without context-window', () => {
  const ctx = setupTest();

  expect(() =>
    checkEndedContract(ctx.codex, {
      type: 'ended',
      outcome: 'finished',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      context: { size: 10, window: 100 },
    }),
  ).toThrow('broke its contract: it sent a context size');
});

test('it passes a guest that sends its point and context from a harness that declares both', () => {
  const ctx = setupTest();

  expect(() =>
    checkEndedContract(ctx.agentSDK, {
      type: 'ended',
      outcome: 'finished',
      boundary: {
        harness: 'agent-sdk',
        sessionID: '6f1d2c3b-4a5e-4f60-8172-93a4b5c6d7e8',
        messageID: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
      },
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      context: { size: 10, window: 100 },
    }),
  ).not.toThrow();
});

test('it passes a guest that sends no point and no context from a harness with no session', () => {
  const ctx = setupTest();

  expect(() =>
    checkEndedContract(ctx.codex, {
      type: 'ended',
      outcome: 'finished',
      stopReason: 'end_turn',
      turns: 1,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }),
  ).not.toThrow();
});
