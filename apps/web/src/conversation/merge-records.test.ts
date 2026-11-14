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
