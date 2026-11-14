import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { parseWriterRecord } from './parse-writer-record';

test('it reads the writer start into its typed shape', () => {
  const record = buildMockLogRecord({
    kind: 'memory.writer_started',
    payload: { startSequence: 12, at: 1_000_000 },
  });

  expect(parseWriterRecord(record)).toStrictEqual({
    kind: 'memory.writer_started',
    startSequence: 12,
    at: 1_000_000,
  });
});

test('it reads a planned batch into its typed shape', () => {
  const record = buildMockLogRecord({
    kind: 'memory.batch_planned',
    payload: { start: 12, end: 18, mode: 'catch_up', at: 1_000_000 },
  });

  expect(parseWriterRecord(record)).toStrictEqual({
    kind: 'memory.batch_planned',
    start: 12,
    end: 18,
    mode: 'catch_up',
    at: 1_000_000,
  });
});

test('it reads a published batch into its typed shape', () => {
  const payload = {
    start: 12,
    end: 18,
    mode: 'live' as const,
    at: 1_000_000,
    applied: [{ itemID: 'item-cello', version: 1 }],
    proposed: 2,
    dropped: 1,
    catchUpEnded: false,
    model: 'writer-model',
    profile: 'memory-writer',
    usage: { inputTokens: 900, outputTokens: 40, cacheReadTokens: 600, cacheWriteTokens: 0 },
  };

  const record = buildMockLogRecord({ kind: 'memory.batch_published', payload });

  expect(parseWriterRecord(record)).toStrictEqual({ kind: 'memory.batch_published', ...payload });
});

test('it reads a published batch with no model call', () => {
  const record = buildMockLogRecord({
    kind: 'memory.batch_published',
    payload: {
      start: 0,
      end: 12,
      mode: 'catch_up',
      at: 1_000_000,
      applied: [],
      proposed: 0,
      dropped: 0,
      catchUpEnded: true,
      model: null,
      profile: null,
      usage: null,
    },
  });

  expect(parseWriterRecord(record)).toStrictEqual({
    kind: 'memory.batch_published',
    start: 0,
    end: 12,
    mode: 'catch_up',
    at: 1_000_000,
    applied: [],
    proposed: 0,
    dropped: 0,
    catchUpEnded: true,
    model: null,
    profile: null,
    usage: null,
  });
});

test('it reads a writer failure into its typed shape', () => {
  const record = buildMockLogRecord({
    kind: 'memory.writer_failed',
    payload: { code: 'model_error', failures: 2, retryAt: 1_060_000, at: 1_000_000 },
  });

  expect(parseWriterRecord(record)).toStrictEqual({
    kind: 'memory.writer_failed',
    code: 'model_error',
    failures: 2,
    retryAt: 1_060_000,
    at: 1_000_000,
  });
});

test('it reads a record of another kind as null', () => {
  const record = buildMockLogRecord({ kind: 'owner_message', payload: { text: 'hello' } });

  expect(parseWriterRecord(record)).toBeNull();
});

test('it throws on a planned batch whose mode is not a batch mode', () => {
  const record = buildMockLogRecord({
    kind: 'memory.batch_planned',
    payload: { start: 12, end: 18, mode: 'replay', at: 1_000_000 },
  });

  expect(() => parseWriterRecord(record)).toThrow();
});

test('it throws on a writer failure with no failures counted', () => {
  const record = buildMockLogRecord({
    kind: 'memory.writer_failed',
    payload: { code: 'model_error', failures: 0, retryAt: 1_060_000, at: 1_000_000 },
  });

  expect(() => parseWriterRecord(record)).toThrow();
});

test('it throws on a writer start with a field it does not know', () => {
  const record = buildMockLogRecord({
    kind: 'memory.writer_started',
    payload: { startSequence: 12, at: 1_000_000, cursor: 3 },
  });

  expect(() => parseWriterRecord(record)).toThrow();
});
