import { expect, test } from 'bun:test';
import { bindHarness } from '@heynixie/models';
import { buildMockCodexProfile, buildMockModelProfile } from '@heynixie/models/test-utils';
import { encodeInboxUUID } from '../inbox/encode-inbox-uuid';
import { buildStepResult } from './build-step-result';

function setupTest() {
  return {
    agentSDK: bindHarness(buildMockModelProfile()),
    codex: bindHarness(buildMockCodexProfile()),
    source: {
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    boundary: {
      harness: 'agent-sdk' as const,
      sessionID: 'session-1',
      messageID: 'message-1',
    },
  };
}

test('it throws a model API refusal that carries no reply record', () => {
  const ctx = setupTest();

  expect(() =>
    buildStepResult(
      ctx.source,
      {
        turn: {
          assistants: [],
          read: [],
          ended: [],
          failure: {
            type: 'failed',
            reason: 'model_api',
            error: 'overloaded',
            detail: 'API Error: 529 Overloaded',
          },
          written: [41],
          settledWritten: 0,
        },
        sent: new Set<number>(),
        hasMore: false,
        notedThrough: null,
        waitTelling: null,
        images: { bytes: 0, count: 0 },
        isSilent: false,
        runID: 'step-1@1',
        silent: new Set(),
        harness: ctx.agentSDK,
        prices: null,
        memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
      },
      [],
    ),
  ).toThrow(expect.objectContaining({ name: 'ModelAPIError', records: [] }));
});

test('it sums the thinking tokens of every ended frame onto the turn end, and writes no reply record', () => {
  const ctx = setupTest();

  const result = buildStepResult(
    ctx.source,
    {
      turn: {
        assistants: [
          { type: 'assistant', messageID: 'message-1', text: 'Let me check.', toolUses: [] },
        ],
        read: [],
        ended: [
          {
            type: 'ended',
            boundary: ctx.boundary,
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 1,
            usage: ctx.usage,
            thinkingTokens: 12,
          },
          {
            type: 'ended',
            boundary: ctx.boundary,
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 1,
            usage: ctx.usage,
            thinkingTokens: 34,
          },
        ],
        failure: null,
        written: [41],
        settledWritten: 1,
      },
      sent: new Set<number>(),
      hasMore: false,
      notedThrough: null,
      waitTelling: null,
      images: { bytes: 0, count: 0 },
      isSilent: false,
      runID: 'step-1@1',
      silent: new Set(),
      harness: ctx.agentSDK,
      prices: null,
      memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
    },
    [],
  );

  expect(
    result.records.map((record) => [record.kind, record.payload?.['thinkingTokens']]),
  ).toStrictEqual([['model.turn_ended', 46]]);
});

test('it commits the text of a held error frame as a reply', () => {
  const ctx = setupTest();

  const result = buildStepResult(
    ctx.source,
    {
      turn: {
        assistants: [
          {
            type: 'assistant',
            messageID: 'message-1',
            text: 'Prompt is too long',
            toolUses: [],
            isError: true,
          },
        ],
        read: [],
        ended: [
          {
            type: 'ended',
            boundary: ctx.boundary,
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 1,
            usage: ctx.usage,
          },
        ],
        failure: null,
        written: [],
        settledWritten: 0,
      },
      sent: new Set<number>(),
      hasMore: false,
      notedThrough: null,
      waitTelling: null,
      images: { bytes: 0, count: 0 },
      isSilent: false,
      runID: 'step-1@1',
      silent: new Set(),
      harness: ctx.agentSDK,
      prices: null,
      memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
    },
    [],
  );

  expect(result.records.at(0)).toStrictEqual({
    kind: 'model.reply',
    definitions: { snapshotHash: 'sha256:test' },
    payload: { model: 'claude-test-1', profile: 'chat-direct', messageID: 'message-1' },
    erasable: { text: 'Prompt is too long' },
  });
});

test('it voids each reply the turn wrote after its last result, and no earlier one', () => {
  const ctx = setupTest();

  const result = buildStepResult(
    ctx.source,
    {
      turn: {
        assistants: [],
        read: [],
        ended: [
          {
            type: 'ended',
            boundary: ctx.boundary,
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 1,
            usage: ctx.usage,
          },
        ],
        failure: null,
        written: [41, 42, 43],
        settledWritten: 1,
      },
      sent: new Set<number>(),
      hasMore: false,
      notedThrough: null,
      waitTelling: null,
      images: { bytes: 0, count: 0 },
      isSilent: false,
      runID: 'step-1@1',
      silent: new Set(),
      harness: ctx.agentSDK,
      prices: null,
      memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
    },
    [],
  );

  expect(
    result.records
      .filter((record) => record.kind === 'model.reply_voided')
      .map((record) => record.payload),
  ).toStrictEqual([
    { replySequence: 42, runID: 'step-1@1', reason: 'turn_dropped' },
    { replySequence: 43, runID: 'step-1@1', reason: 'turn_dropped' },
  ]);
});

test('it keeps the text a silent turn wrote, and marks its turn end silent', () => {
  const ctx = setupTest();

  const result = buildStepResult(
    ctx.source,
    {
      turn: {
        assistants: [],
        read: [],
        ended: [
          {
            type: 'ended',
            boundary: ctx.boundary,
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 2,
            usage: ctx.usage,
          },
        ],
        failure: null,
        written: [41],
        settledWritten: 1,
      },
      sent: new Set<number>(),
      hasMore: false,
      notedThrough: null,
      waitTelling: null,
      images: { bytes: 0, count: 0 },
      isSilent: true,
      runID: 'step-1@1',
      silent: new Set(),
      harness: ctx.agentSDK,
      prices: null,
      memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
    },
    [],
  );

  expect(result.records.map((record) => [record.kind, record.payload?.['isSilent']])).toStrictEqual(
    [['model.turn_ended', true]],
  );
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
        written: [],
        settledWritten: 0,
      },
      sent: new Set<number>(),
      hasMore: false,
      notedThrough: null,
      waitTelling: null,
      images: { bytes: 0, count: 0 },
      isSilent: false,
      runID: 'step-1@1',
      silent: new Set(),
      harness: ctx.codex,
      prices: null,
      memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
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
          written: [],
          settledWritten: 0,
        },
        sent: new Set<number>(),
        hasMore: false,
        notedThrough: null,
        waitTelling: null,
        images: { bytes: 0, count: 0 },
        isSilent: false,
        runID: 'step-1@1',
        silent: new Set(),
        harness: ctx.codex,
        prices: null,
        memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
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
          written: [],
          settledWritten: 0,
        },
        sent: new Set<number>(),
        hasMore: false,
        notedThrough: null,
        waitTelling: null,
        images: { bytes: 0, count: 0 },
        isSilent: false,
        runID: 'step-1@1',
        silent: new Set(),
        harness: ctx.agentSDK,
        prices: null,
        memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
      },
      [],
    ),
  ).toThrow('broke its contract');
});

test('it fails a step whose earlier ended frame broke the contract, though its last one did not', () => {
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
              usage: ctx.usage,
              context: { size: 10, window: 100 },
            },
            {
              type: 'ended',
              outcome: 'finished',
              stopReason: 'end_turn',
              turns: 1,
              usage: ctx.usage,
            },
          ],
          failure: null,
          written: [],
          settledWritten: 0,
        },
        sent: new Set<number>(),
        hasMore: false,
        notedThrough: null,
        waitTelling: null,
        images: { bytes: 0, count: 0 },
        isSilent: false,
        runID: 'step-1@1',
        silent: new Set(),
        harness: ctx.codex,
        prices: null,
        memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
      },
      [],
    ),
  ).toThrow('it sent a context size');
});

test('it acknowledges a silent record that the guest never reports read, and a read record that was sent', () => {
  const ctx = setupTest();

  const result = buildStepResult(
    {
      definitions: () => ({ snapshotHash: 'sha256:test' }),
      model: { model: 'claude-test-1', profile: 'chat-direct' },
    },
    {
      turn: {
        assistants: [],
        read: [encodeInboxUUID(12), encodeInboxUUID(99)],
        ended: [
          {
            type: 'ended',
            boundary: { harness: 'agent-sdk', sessionID: 'session-1', messageID: 'message-1' },
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 1,
            usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
          },
        ],
        failure: null,
        written: [],
        settledWritten: 0,
      },
      sent: new Set([11, 12]),
      silent: new Set([11]),
      hasMore: false,
      notedThrough: null,
      waitTelling: null,
      images: { bytes: 0, count: 0 },
      isSilent: false,
      runID: 'step-1@1',
      harness: ctx.agentSDK,
      prices: null,
      memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
    },
    [],
  );

  expect(result.acknowledged).toIncludeSameMembers([11, 12]);
});

test('it acknowledges no silent record for a turn that failed', () => {
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
          ended: [],
          failure: { type: 'failed', reason: 'error', detail: 'the guest exited' },
          written: [],
          settledWritten: 0,
        },
        sent: new Set([11]),
        silent: new Set([11]),
        hasMore: false,
        notedThrough: null,
        waitTelling: null,
        images: { bytes: 0, count: 0 },
        isSilent: false,
        runID: 'step-1@1',
        harness: ctx.agentSDK,
        prices: null,
        memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
      },
      [],
    ),
  ).toThrow('the conversation turn failed');
});

test.each([
  {
    prices: { input: 3, cacheWrite: 3.75, cacheWrite1h: 6, cachedInput: 0.3, output: 15 },
    dollars: 0.000105,
  },
  {
    prices: { input: 6, cacheWrite: 3.75, cacheWrite1h: 6, cachedInput: 0.3, output: 15 },
    dollars: 0.000135,
  },
  { prices: null, dollars: undefined },
])('it records $dollars dollars on the turn end of a profile with prices $prices', (row) => {
  const ctx = setupTest();

  const result = buildStepResult(
    ctx.source,
    {
      turn: {
        assistants: [],
        read: [],
        ended: [
          {
            type: 'ended',
            boundary: ctx.boundary,
            outcome: 'finished',
            stopReason: 'end_turn',
            turns: 1,
            usage: ctx.usage,
          },
        ],
        failure: null,
        written: [],
        settledWritten: 0,
      },
      sent: new Set<number>(),
      hasMore: false,
      notedThrough: null,
      waitTelling: null,
      images: { bytes: 0, count: 0 },
      isSilent: false,
      runID: 'step-1@1',
      silent: new Set(),
      harness: ctx.agentSDK,
      prices: row.prices,
      memory: { pinnedCore: [], retrieved: [], invalidatedThrough: 0 },
    },
    [],
  );

  expect(result.records.map((record) => record.payload?.['dollars'])).toStrictEqual([row.dollars]);
});
