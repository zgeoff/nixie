import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { collectAnsweredSequences } from './collect-answered-sequences';

test('#collectAnsweredSequences takes the records that a reply before a cleanup read', () => {
  const records = [
    buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 }),
    buildMockLogRecord({
      kind: 'model.reply',
      sequence: 5,
      payload: { model: 'm', profile: 'p', messageID: 'msg_5', readSequences: [2, 3] },
    }),
  ];

  expect(collectAnsweredSequences(records)).toStrictEqual(new Set([2, 3]));
});

test('#collectAnsweredSequences answers nothing for a reply that names no read', () => {
  const records = [
    buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 }),
    buildMockLogRecord({
      kind: 'model.reply',
      sequence: 5,
      payload: { model: 'm', profile: 'p', messageID: 'msg_5' },
    }),
  ];

  expect(collectAnsweredSequences(records)).toStrictEqual(new Set());
});

test('#collectAnsweredSequences leaves a reply after the cleanup to the lost-reply sweep', () => {
  const records = [
    buildMockLogRecord({
      kind: 'model.reply',
      sequence: 12,
      payload: { model: 'm', profile: 'p', messageID: 'msg_12', readSequences: [2] },
    }),
    buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 }),
  ];

  expect(collectAnsweredSequences(records)).toStrictEqual(new Set());
});

test('#collectAnsweredSequences drops a reply that a void names', () => {
  const records = [
    buildMockLogRecord({
      kind: 'model.reply_voided',
      sequence: 10,
      payload: { replySequence: 5, runID: 'conversation:1@1', reason: 'attempt_failed' },
    }),
    buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 }),
    buildMockLogRecord({
      kind: 'model.reply',
      sequence: 5,
      payload: { model: 'm', profile: 'p', messageID: 'msg_5', readSequences: [2] },
    }),
  ];

  expect(collectAnsweredSequences(records)).toStrictEqual(new Set());
});

test('#collectAnsweredSequences stops at a step commit', () => {
  const records = [
    buildMockLogRecord({ kind: 'model.session_invalidated', sequence: 9 }),
    buildMockLogRecord({ kind: 'task.step_committed', sequence: 7 }),
    buildMockLogRecord({
      kind: 'model.reply',
      sequence: 5,
      payload: { model: 'm', profile: 'p', messageID: 'msg_5', readSequences: [2] },
    }),
  ];

  expect(collectAnsweredSequences(records)).toStrictEqual(new Set());
});
