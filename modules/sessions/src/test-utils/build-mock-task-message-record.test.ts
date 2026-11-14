import { expect, test } from 'bun:test';
import { buildMockTaskMessageRecord } from './build-mock-task-message-record';

test('it builds a request from the conversation to a task at the given hop', () => {
  const record = buildMockTaskMessageRecord(12, 3);

  expect([record.sequence, record.kind, record.thread, record.payload]).toStrictEqual([
    12,
    'task_message',
    't4m2',
    {
      messageID: 'm12',
      from: 'conversation',
      to: 't4m2',
      kind: 'request',
      replyTo: null,
      onBehalfOf: [],
      hop: 3,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:conversation',
    },
  ]);
});
