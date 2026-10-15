import { expect, test } from 'bun:test';
import { findCompactionFailure } from './find-compaction-failure';
import { buildMockLogRecord } from './test-utils/build-mock-log-record';

test('it finds the failures in a row from the first failed compaction', () => {
  const failed = buildMockLogRecord({
    compactionFailure: { failures: 1 },
    kind: 'model.compaction_failed',
    sequence: 4,
  });

  expect(findCompactionFailure([failed])).toBe(1);
});

test('it finds no failure once a summary commits after it', () => {
  const failed = buildMockLogRecord({
    compactionFailure: { failures: 2 },
    kind: 'model.compaction_failed',
    sequence: 4,
  });

  const summarized = buildMockLogRecord({
    kind: 'model.session_summarized',
    sequence: 9,
    summary: { summaryTokens: 1200, trigger: 'threshold' },
  });

  expect(findCompactionFailure([failed, summarized])).toBeNull();
});

test('it finds no failure once a new session opens after it', () => {
  const failed = buildMockLogRecord({
    compactionFailure: { failures: 2 },
    kind: 'model.compaction_failed',
    sequence: 4,
  });

  const opened = buildMockLogRecord({ kind: 'model.session_opened', sequence: 9 });

  expect(findCompactionFailure([failed, opened])).toBeNull();
});

test('it finds no failure once a forget invalidates the session after it', () => {
  const failed = buildMockLogRecord({
    compactionFailure: { failures: 2 },
    kind: 'model.compaction_failed',
    sequence: 4,
  });

  const invalidated = buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 });

  expect(findCompactionFailure([failed, invalidated])).toBeNull();
});

test('it keeps the failure across the turns that ran on the old session after it', () => {
  const failed = buildMockLogRecord({
    compactionFailure: { failures: 2 },
    kind: 'model.compaction_failed',
    sequence: 4,
  });

  const reply = buildMockLogRecord({ kind: 'model.reply', sequence: 5 });

  expect(findCompactionFailure([failed, reply])).toBe(2);
});
