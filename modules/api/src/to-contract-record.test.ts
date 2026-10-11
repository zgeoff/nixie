import { expect, test } from 'bun:test';
import { toContractRecord } from './to-contract-record';

test('it carries your message with its text and spans', () => {
  expect(
    toContractRecord({
      sequence: 7,
      recordedAt: new Date('2026-10-10T12:00:00Z'),
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      stepKey: null,
      parent: null,
      contentSource: 'owner',
      decision: null,
      promptCause: null,
      approval: null,
      payload: { clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', spans: 'as_sent' },
      erasable: {
        status: 'readable',
        fields: { text: 'hello', spans: [{ start: 0, end: 5, source: 'typed' }] },
      },
    }),
  ).toStrictEqual({
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

test('it keeps a forgotten message in place with no text', () => {
  expect(
    toContractRecord({
      sequence: 7,
      recordedAt: new Date('2026-10-10T12:00:00Z'),
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      stepKey: null,
      parent: null,
      contentSource: 'owner',
      decision: null,
      promptCause: null,
      approval: null,
      payload: { clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60', spans: 'as_sent' },
      erasable: { status: 'shredded' },
    }),
  ).toStrictEqual({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 7,
    thread: 'conversation',
  });
});

test('it carries no message text for a record of another kind', () => {
  expect(
    toContractRecord({
      sequence: 3,
      recordedAt: new Date('2026-10-10T12:00:00Z'),
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-1',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { taskID: 'task-1' },
      erasable: { status: 'readable', fields: { text: 'a brief' } },
    }),
  ).toStrictEqual({
    kind: 'task.created',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 3,
    thread: 'task-1',
  });
});

test('it shows no record that belongs to no thread', () => {
  expect(
    toContractRecord({
      sequence: 2,
      recordedAt: new Date('2026-10-10T12:00:00Z'),
      kind: 'session.enrolled',
      definitions: { snapshotHash: 'sha256:test' },
      thread: null,
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { identityID: 's-1' },
      erasable: { status: 'readable', fields: { label: 'laptop' } },
    }),
  ).toBeNull();
});
