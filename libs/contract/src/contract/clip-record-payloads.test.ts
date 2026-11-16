import { expect, test } from 'bun:test';
import type { LogRecord } from '../types';
import { clipRecordPayloads } from './clip-record-payloads';
import { payloadClipBytes } from './payload-clip-bytes';

test('it cuts a long string of a tool result to the clip size and lists it', () => {
  const record: LogRecord = {
    kind: 'tool_result',
    recordedAt: new Date('2026-11-01T09:00:00Z'),
    sequence: 12,
    thread: 'k3vq8m2xpa',
    toolCall: {
      callID: 'call-1',
      content: { result: { url: 'https://cafe-list.test/north', text: 'a'.repeat(10_000) } },
      tool: 'web.fetch',
    },
  };

  expect(clipRecordPayloads(record)).toStrictEqual({
    ...record,
    clipped: [{ field: 'toolCall.content', path: ['result', 'text'], bytes: 10_000 }],
    toolCall: {
      callID: 'call-1',
      content: {
        result: { url: 'https://cafe-list.test/north', text: 'a'.repeat(payloadClipBytes) },
      },
      tool: 'web.fetch',
    },
  });
});

test('it cuts on a code point boundary', () => {
  // each "é" takes 2 bytes, so a cut at 4097 bytes would split one
  const record: LogRecord = {
    kind: 'tool_result',
    recordedAt: new Date('2026-11-01T09:00:00Z'),
    sequence: 12,
    thread: 'k3vq8m2xpa',
    toolCall: {
      callID: 'call-1',
      content: { text: `a${'é'.repeat(3000)}` },
    },
  };

  const text = clipRecordPayloads(record).toolCall?.content?.['text'];

  expect(text).toBe(`a${'é'.repeat(2047)}`);
});

test('it lists the long strings of an input array by index', () => {
  const record: LogRecord = {
    kind: 'tool_result',
    recordedAt: new Date('2026-11-01T09:00:00Z'),
    sequence: 12,
    thread: 'k3vq8m2xpa',
    toolCall: {
      callID: 'call-1',
      input: { pages: ['short', 'b'.repeat(5000)] },
    },
  };

  expect(clipRecordPayloads(record).clipped).toStrictEqual([
    { field: 'toolCall.input', path: ['pages', 1], bytes: 5000 },
  ]);
});

test('it leaves out a field that stays past 64 KiB after its cuts, and lists it with no path', () => {
  const words = Array.from({ length: 20_000 }, () => 'beans');

  const record: LogRecord = {
    kind: 'tool_result',
    recordedAt: new Date('2026-11-01T09:00:00Z'),
    sequence: 12,
    thread: 'k3vq8m2xpa',
    toolCall: { callID: 'call-1', content: { words }, tool: 'web.search' },
  };

  const clipped = clipRecordPayloads(record);

  expect(clipped.toolCall).toStrictEqual({ callID: 'call-1', tool: 'web.search' });

  expect(clipped.clipped).toStrictEqual([
    { field: 'toolCall.content', path: [], bytes: JSON.stringify({ words }).length },
  ]);
});

test('it cuts the text of a worker turn', () => {
  const turn: LogRecord = {
    kind: 'worker.turn_ended',
    recordedAt: new Date('2026-11-01T09:00:00Z'),
    sequence: 13,
    thread: 'k3vq8m2xpa',
    worker: {
      phase: 'turn',
      workerRunID: 'w1',
      callID: 'call-1',
      turn: 1,
      tokens: 10,
      dollars: 0.01,
      text: 'c'.repeat(9000),
    },
  };

  expect(clipRecordPayloads(turn)).toStrictEqual({
    ...turn,
    clipped: [{ field: 'worker.text', path: [], bytes: 9000 }],
    worker: {
      phase: 'turn',
      workerRunID: 'w1',
      callID: 'call-1',
      turn: 1,
      tokens: 10,
      dollars: 0.01,
      text: 'c'.repeat(payloadClipBytes),
    },
  });
});

test('it returns a record with no long string unchanged', () => {
  const record: LogRecord = {
    kind: 'tool_result',
    recordedAt: new Date('2026-11-01T09:00:00Z'),
    sequence: 12,
    thread: 'k3vq8m2xpa',
    toolCall: { callID: 'call-1', input: { query: 'beans' } },
  };

  expect(clipRecordPayloads(record)).toStrictEqual(record);
});
