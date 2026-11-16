import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { toContractRecord } from './to-contract-record';
import { toWorkerView } from './to-worker-view';

test('it maps a started worker run with its limits and tools', () => {
  const record = buildMockLogRecord({
    sequence: 20,
    kind: 'worker.run_started',
    thread: 'k3vq8m2xpa',
    payload: {
      workerRunID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      shortID: 'w7k2m9qa4x',
      callID: 'call-1',
      stepRunID: 'step-1',
      model: 'test-model',
      profile: 'worker',
      tools: ['web.fetch'],
      limits: { minutes: 5, turns: 8, tokens: 100_000, dollars: 0.5 },
      isTaskLimit: false,
    },
  });

  expect(toWorkerView(record)).toStrictEqual({
    phase: 'started',
    workerRunID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    shortID: 'w7k2m9qa4x',
    callID: 'call-1',
    model: 'test-model',
    tools: ['web.fetch'],
    limits: { minutes: 5, turns: 8, tokens: 100_000, dollars: 0.5 },
    isTaskLimit: false,
  });
});

test('it sums the 4 token counts of a worker turn and carries its text', () => {
  const record = buildMockLogRecord({
    sequence: 21,
    kind: 'worker.turn_ended',
    thread: 'k3vq8m2xpa',
    payload: {
      workerRunID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      callID: 'call-1',
      model: 'test-model',
      profile: 'worker',
      turn: 2,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 3,
      cacheWriteTokens: 4,
      dollars: 0.02,
    },
    erasable: { status: 'readable', fields: { text: 'The beans go by the fence.' } },
  });

  expect(toWorkerView(record)).toStrictEqual({
    phase: 'turn',
    workerRunID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    callID: 'call-1',
    turn: 2,
    tokens: 127,
    dollars: 0.02,
    text: 'The beans go by the fence.',
  });
});

test('it leaves the text off a worker turn that a forget erased', () => {
  const record = buildMockLogRecord({
    sequence: 21,
    kind: 'worker.turn_ended',
    thread: 'k3vq8m2xpa',
    payload: {
      workerRunID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      callID: 'call-1',
      model: 'test-model',
      profile: 'worker',
      turn: 1,
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      dollars: 0,
    },
    erasable: { status: 'shredded' },
  });

  expect(toWorkerView(record)).toStrictEqual({
    phase: 'turn',
    workerRunID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    callID: 'call-1',
    turn: 1,
    tokens: 2,
    dollars: 0,
  });
});

test('it maps an ended worker run with its outcome, usage and failure detail', () => {
  const record = buildMockLogRecord({
    sequence: 22,
    kind: 'worker.run_ended',
    thread: 'k3vq8m2xpa',
    payload: {
      workerRunID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      callID: 'call-1',
      model: 'test-model',
      profile: 'worker',
      outcome: 'failed',
      used: { minutes: 1.5, turns: 2, tokens: 300, dollars: 0.03 },
    },
    erasable: { status: 'readable', fields: { detail: 'the model service refused' } },
  });

  expect(toWorkerView(record)).toStrictEqual({
    phase: 'ended',
    workerRunID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    callID: 'call-1',
    outcome: 'failed',
    used: { minutes: 1.5, turns: 2, tokens: 300, dollars: 0.03 },
    detail: 'the model service refused',
  });
});

test('it carries the tool run ID of a tool call', () => {
  const call = buildMockLogRecord({
    sequence: 23,
    kind: 'tool_called',
    thread: 'k3vq8m2xpa',
    payload: {
      callID: 'call-2',
      runID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      toolUseID: null,
      tool: 'web.fetch',
      model: 'test-model',
      profile: 'worker',
    },
    erasable: { status: 'readable', fields: { input: { url: 'https://cafe-list.test/north' } } },
  });

  expect(toContractRecord(call)?.toolCall).toStrictEqual({
    callID: 'call-2',
    input: { url: 'https://cafe-list.test/north' },
    runID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    tool: 'web.fetch',
  });
});
