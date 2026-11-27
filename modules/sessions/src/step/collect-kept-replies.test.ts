import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { collectKeptReplies } from './collect-kept-replies';

test('#collectKeptReplies keeps a reply before a cleanup', () => {
  const records = [
    buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 }),
    buildMockLogRecord({ kind: 'model.reply', sequence: 5 }),
  ];

  expect(collectKeptReplies(records)).toStrictEqual([5]);
});

test('#collectKeptReplies leaves a reply after the cleanup to the lost-reply sweep', () => {
  const records = [
    buildMockLogRecord({ kind: 'model.reply', sequence: 12 }),
    buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 }),
  ];

  expect(collectKeptReplies(records)).toStrictEqual([]);
});

test('#collectKeptReplies drops a reply that a void names', () => {
  const records = [
    buildMockLogRecord({
      kind: 'model.reply_voided',
      sequence: 10,
      payload: { replySequence: 5, runID: 'conversation:1@1', reason: 'attempt_failed' },
    }),
    buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 }),
    buildMockLogRecord({ kind: 'model.reply', sequence: 5 }),
  ];

  expect(collectKeptReplies(records)).toStrictEqual([]);
});

test('#collectKeptReplies stops at a step commit', () => {
  const records = [
    buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 }),
    buildMockLogRecord({ kind: 'task.step_committed', sequence: 7 }),
    buildMockLogRecord({ kind: 'model.reply', sequence: 5 }),
  ];

  expect(collectKeptReplies(records)).toStrictEqual([]);
});
