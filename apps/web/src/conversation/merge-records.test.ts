import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { mergeRecords } from './merge-records';

test('it drops the input and the content of a tool record that a forget names, and keeps its name and outcome', () => {
  const recordedAt = new Date('2026-11-14T10:00:00Z');

  const result = buildMockLogRecord({
    kind: 'tool_result',
    recordedAt,
    sequence: 7,
    thread: 'conversation',
    toolCall: {
      callID: 'call-1',
      content: { page: 'The locker code is 2291.' },
      input: { url: 'https://lockers.test/' },
      outcome: 'ok',
      tool: 'web.fetch',
    },
  });

  const forget = buildMockLogRecord({
    forget: { sequence: 7 },
    kind: 'record.forget_started',
    sequence: 8,
    thread: 'conversation',
  });

  const merged = mergeRecords([result], [forget]);

  expect(merged.records.at(0)).toStrictEqual({
    isRemoved: true,
    kind: 'tool_result',
    recordedAt,
    sequence: 7,
    thread: 'conversation',
    toolCall: { callID: 'call-1', outcome: 'ok', tool: 'web.fetch' },
  });
});

test('it drops the text of a message that a forget names', () => {
  const message = buildMockLogRecord({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
    sequence: 3,
  });

  const forgotten = buildMockLogRecord({ forget: { sequence: 3 }, kind: 'record.forgotten' });
  const merged = mergeRecords([message], [{ ...forgotten, sequence: 4 }]);

  expect(merged.records.at(0)?.message).toBeUndefined();
  expect(merged.records.at(0)?.isRemoved).toBe(true);
});

test('it lists the client message ID of a forgotten message', () => {
  const message = buildMockLogRecord({
    kind: 'owner_message',
    message: { clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', text: 'Hello' },
    sequence: 3,
  });

  const forget = buildMockLogRecord({
    forget: { sequence: 3 },
    kind: 'record.forget_started',
    sequence: 4,
  });

  const merged = mergeRecords([message], [forget]);

  expect(merged.forgottenClientMessageIDs).toStrictEqual(['0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60']);
});

test('it leaves a tool record that no forget names readable', () => {
  const result = buildMockLogRecord({
    kind: 'tool_result',
    sequence: 7,
    toolCall: { callID: 'call-1', content: { page: 'The locker code is 2291.' } },
  });

  const merged = mergeRecords([result], []);

  expect(merged.records).toStrictEqual([result]);
});

test('it drops the error text of a failed step record that a forget names', () => {
  const failed = buildMockLogRecord({
    kind: 'task.step_errored',
    sequence: 5,
    task: { error: 'Request failed for private code 6210', stepKey: 'step-1', taskID: 'task-1' },
  });

  const forget = buildMockLogRecord({
    forget: { sequence: 5 },
    kind: 'record.forgotten',
    sequence: 6,
  });

  const record = mergeRecords([failed], [forget]).records.at(0);

  expect(record?.isRemoved).toBe(true);
  expect(record?.task).toStrictEqual({ stepKey: 'step-1', taskID: 'task-1' });
});

test('it drops the text of a worker turn and the detail of a worker end that a forget names, and keeps the usage', () => {
  const turn = buildMockLogRecord({
    kind: 'worker.turn_ended',
    sequence: 5,
    worker: {
      phase: 'turn',
      workerRunID: 'w1',
      callID: 'call-1',
      turn: 1,
      tokens: 10,
      dollars: 0.01,
      text: 'private model text',
    },
  });

  const forget = buildMockLogRecord({
    forget: { sequence: 5 },
    kind: 'record.forgotten',
    sequence: 6,
  });

  const record = mergeRecords([turn], [forget]).records.at(0);

  expect(record?.worker).toStrictEqual({
    phase: 'turn',
    workerRunID: 'w1',
    callID: 'call-1',
    turn: 1,
    tokens: 10,
    dollars: 0.01,
  });
});

test('it marks the reply that a void record names as voided', () => {
  const reply = buildMockLogRecord({
    kind: 'model.reply',
    message: { text: 'Draft.' },
    sequence: 4,
  });

  const other = buildMockLogRecord({
    kind: 'model.reply',
    message: { text: 'Final.' },
    sequence: 6,
  });

  const voidRecord = buildMockLogRecord({
    kind: 'model.reply_voided',
    sequence: 5,
    voidedReply: { sequence: 4, reason: 'attempt_failed' },
  });

  const merged = mergeRecords([reply, voidRecord, other], []);

  expect(merged.records.map((record) => record.message)).toStrictEqual([
    { text: 'Draft.', isVoided: true, voidReason: 'attempt_failed' },
    undefined,
    { text: 'Final.' },
  ]);
});

test('it drops the content of a tool record that an expiry names, and marks it expired, not removed', () => {
  const recordedAt = new Date('2026-11-14T10:00:00Z');

  const result = buildMockLogRecord({
    kind: 'tool_result',
    recordedAt,
    sequence: 7,
    thread: 'conversation',
    toolCall: {
      callID: 'call-1',
      content: { page: 'The locker code is 2291.' },
      outcome: 'ok',
      tool: 'web.fetch',
    },
  });

  const expiry = buildMockLogRecord({
    expiry: { sequences: [7] },
    kind: 'erasure.started',
    sequence: 9,
    thread: 'conversation',
  });

  const merged = mergeRecords([result], [expiry]);

  expect(merged.records.at(0)).toStrictEqual({
    isExpired: true,
    kind: 'tool_result',
    recordedAt,
    sequence: 7,
    thread: 'conversation',
    toolCall: { callID: 'call-1', outcome: 'ok', tool: 'web.fetch' },
  });
});
