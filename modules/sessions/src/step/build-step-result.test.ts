import { expect, test } from 'bun:test';
import { bindHarness } from '@heynixie/models';
import { buildMockModelProfile, buildStubCodexHarness } from '@heynixie/models/test-utils';
import { buildStepResult } from './build-step-result';

function setupTest() {
  return { agentSDK: bindHarness(buildMockModelProfile()), codex: buildStubCodexHarness() };
}

test('it records no reply with the error of a silent turn that the model API refused', () => {
  const ctx = setupTest();

  expect(() =>
    buildStepResult(
      {
        definitions: () => ({ snapshotHash: 'sha256:test' }),
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
      {
        turn: {
          assistants: [
            { type: 'assistant', messageID: 'message-1', text: 'Nothing to add.', toolUses: [] },
          ],
          read: [],
          ended: [],
          failure: {
            type: 'failed',
            reason: 'model_api',
            error: 'overloaded',
            detail: 'API Error: 529 Overloaded',
          },
        },
        sent: new Set<number>(),
        hasMore: false,
        notedThrough: null,
        images: { bytes: 0, count: 0 },
        isSilent: true,
        harness: ctx.agentSDK,
        memory: { pinnedCore: [], retrieved: [], retrievedMessages: [], invalidatedThrough: 0 },
      },
      [],
    ),
  ).toThrow(expect.objectContaining({ name: 'ModelAPIError', records: [] }));
});

test('it sums the thinking tokens of every ended frame onto the last reply, and leaves earlier replies without the count', () => {
  const ctx = setupTest();

  const result = buildStepResult(
    {
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    {
      turn: {
        assistants: [
          { type: 'assistant', messageID: 'message-1', text: 'Let me check.', toolUses: [] },
          {
            type: 'assistant',
            messageID: 'message-2',
            text: 'Take the 09:25 ferry.',
            toolUses: [],
          },
        ],
        read: [],
        ended: [
          {
            type: 'ended',
            boundary: { harness: 'agent-sdk', sessionID: 'session-1', messageID: 'message-1' },
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 1,
            usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
            thinkingTokens: 12,
          },
          {
            type: 'ended',
            boundary: { harness: 'agent-sdk', sessionID: 'session-1', messageID: 'message-2' },
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 1,
            usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
            thinkingTokens: 34,
          },
        ],
        failure: null,
      },
      sent: new Set<number>(),
      hasMore: false,
      notedThrough: null,
      images: { bytes: 0, count: 0 },
      isSilent: false,
      harness: ctx.agentSDK,
      memory: { pinnedCore: [], retrieved: [], retrievedMessages: [], invalidatedThrough: 0 },
    },
    [],
  );

  const replies = result.records.filter((record) => record.kind === 'model.reply');

  expect(replies.at(0)?.payload).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    messageID: 'message-1',
  });

  expect(replies.at(1)?.payload).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    messageID: 'message-2',
    thinkingTokens: 46,
  });
});

test('it records no reply for a silent turn, and marks its turn end silent', () => {
  const ctx = setupTest();

  const result = buildStepResult(
    {
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    {
      turn: {
        assistants: [
          { type: 'assistant', messageID: 'message-1', text: 'Nothing to add.', toolUses: [] },
        ],
        read: [],
        ended: [
          {
            type: 'ended',
            boundary: { harness: 'agent-sdk', sessionID: 'session-1', messageID: 'message-1' },
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 2,
            usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
          },
        ],
        failure: null,
      },
      sent: new Set<number>(),
      hasMore: false,
      notedThrough: null,
      images: { bytes: 0, count: 0 },
      isSilent: true,
      harness: ctx.agentSDK,
      memory: { pinnedCore: [], retrieved: [], retrievedMessages: [], invalidatedThrough: 0 },
    },
    [],
  );

  expect(result).toStrictEqual({
    next: 'wait',
    records: [
      {
        kind: 'model.turn_ended',
        definitions: { snapshotHash: 'sha256:test' },
        payload: {
          model: 'claude-test-1',
          profile: 'chat-direct',
          outcome: 'finished',
          stopReason: 'end_turn',
          turns: 2,
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          pinnedCore: [],
          retrieved: [],
          retrievedMessages: [],
          invalidatedThrough: 0,
          sessionImageBytes: 0,
          sessionImageCount: 0,
          isSilent: true,
        },
      },
    ],
    acknowledged: [],
    sessionBoundary: JSON.stringify({
      harness: 'agent-sdk',
      sessionID: 'session-1',
      messageID: 'message-1',
    }),
  });
});

test('it stores no session point for a step on a harness with no session, and records the outcome of the turn', () => {
  const ctx = setupTest();

  const result = buildStepResult(
    {
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    {
      turn: {
        assistants: [{ type: 'assistant', messageID: 'message-1', text: 'Done.', toolUses: [] }],
        read: [],
        ended: [
          {
            type: 'ended',
            outcome: 'limit',
            stopReason: 'tool_use',
            turns: 2,
            usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
          },
        ],
        failure: null,
      },
      sent: new Set<number>(),
      hasMore: false,
      notedThrough: null,
      images: { bytes: 0, count: 0 },
      isSilent: false,
      harness: ctx.codex,
      memory: { pinnedCore: [], retrieved: [], retrievedMessages: [], invalidatedThrough: 0 },
    },
    [],
  );

  const ended = result.records.find((record) => record.kind === 'model.turn_ended');

  expect([result.sessionBoundary, ended?.payload?.['outcome']]).toStrictEqual([null, 'limit']);
});

test('it fails a step whose turn overflowed', () => {
  const ctx = setupTest();

  expect(() =>
    buildStepResult(
      {
        definitions: () => ({ snapshotHash: 'sha256:test' }),
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
      {
        turn: {
          assistants: [],
          read: [],
          ended: [
            {
              type: 'ended',
              outcome: 'overflow',
              stopReason: null,
              turns: 1,
              usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
            },
          ],
          failure: null,
        },
        sent: new Set<number>(),
        hasMore: false,
        notedThrough: null,
        images: { bytes: 0, count: 0 },
        isSilent: false,
        harness: ctx.codex,
        memory: { pinnedCore: [], retrieved: [], retrievedMessages: [], invalidatedThrough: 0 },
      },
      [],
    ),
  ).toThrow('the conversation turn passed the context window');
});

test('it fails a step whose guest broke the contract of its harness', () => {
  const ctx = setupTest();

  expect(() =>
    buildStepResult(
      {
        definitions: () => ({ snapshotHash: 'sha256:test' }),
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
      {
        turn: {
          assistants: [],
          read: [],
          ended: [
            {
              type: 'ended',
              outcome: 'finished',
              stopReason: 'end_turn',
              turns: 1,
              usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
            },
          ],
          failure: null,
        },
        sent: new Set<number>(),
        hasMore: false,
        notedThrough: null,
        images: { bytes: 0, count: 0 },
        isSilent: false,
        harness: ctx.agentSDK,
        memory: { pinnedCore: [], retrieved: [], retrievedMessages: [], invalidatedThrough: 0 },
      },
      [],
    ),
  ).toThrow('broke its contract');
});

test('it fails a step whose earlier ended frame broke the contract, though its last one did not', () => {
  const ctx = setupTest();
  const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };

  expect(() =>
    buildStepResult(
      {
        definitions: () => ({ snapshotHash: 'sha256:test' }),
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
      {
        turn: {
          assistants: [],
          read: [],
          ended: [
            {
              type: 'ended',
              outcome: 'finished',
              stopReason: 'end_turn',
              turns: 1,
              usage,
              context: { size: 10, window: 100 },
            },
            { type: 'ended', outcome: 'finished', stopReason: 'end_turn', turns: 1, usage },
          ],
          failure: null,
        },
        sent: new Set<number>(),
        hasMore: false,
        notedThrough: null,
        images: { bytes: 0, count: 0 },
        isSilent: false,
        harness: ctx.codex,
        memory: { pinnedCore: [], retrieved: [], retrievedMessages: [], invalidatedThrough: 0 },
      },
      [],
    ),
  ).toThrow('it sent a context size');
});
