import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { toContractRecord } from './to-contract-record';

test('it carries your message with its text and spans', () => {
  const record = buildMockLogRecord({
    sequence: 7,
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    kind: 'owner_message',
    thread: 'conversation',
    contentSource: 'owner',
    payload: { clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', spans: 'as_sent' },
    erasable: {
      status: 'readable',
      fields: { text: 'hello', spans: [{ start: 0, end: 5, source: 'typed' }] },
    },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'owner_message',
    message: {
      clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
      spans: [{ start: 0, end: 5, source: 'typed' }],
      text: 'hello',
    },
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 7,
    thread: 'conversation',
  });
});

test('it carries the model reply with its text', () => {
  const record = buildMockLogRecord({
    sequence: 9,
    recordedAt: new Date('2026-10-10T12:00:01Z'),
    kind: 'model.reply',
    thread: 'conversation',
    payload: { model: 'claude-test-1', profile: 'chat-direct' },
    erasable: { status: 'readable', fields: { text: 'Hello.' } },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'model.reply',
    message: { text: 'Hello.' },
    recordedAt: new Date('2026-10-10T12:00:01Z'),
    sequence: 9,
    thread: 'conversation',
  });
});

test('it keeps a forgotten message in place with no text', () => {
  const record = buildMockLogRecord({
    sequence: 7,
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    kind: 'owner_message',
    thread: 'conversation',
    contentSource: 'owner',
    payload: { clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', spans: 'as_sent' },
    erasable: { status: 'shredded' },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 7,
    thread: 'conversation',
  });
});

test('it carries no message text for a record of another kind', () => {
  const record = buildMockLogRecord({
    sequence: 3,
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    kind: 'task.created',
    thread: 'task-1',
    payload: { taskID: 'task-1' },
    erasable: { status: 'readable', fields: { text: 'a brief' } },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'task.created',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 3,
    thread: 'task-1',
  });
});

test('it shows no record that belongs to no thread', () => {
  const record = buildMockLogRecord({
    kind: 'session.enrolled',
    thread: null,
    payload: { identityID: 's-1' },
    erasable: { status: 'readable', fields: { label: 'laptop' } },
  });

  expect(toContractRecord(record)).toBeNull();
});
