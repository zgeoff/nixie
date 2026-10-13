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
    task: { taskID: 'task-1' },
    thread: 'task-1',
  });
});

test('it names the task and the step of a step record', () => {
  expect(
    toContractRecord({
      sequence: 4,
      recordedAt: new Date('2026-10-10T12:00:00Z'),
      kind: 'task.step_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { taskID: 'conversation', stepKey: 'step-2' },
      erasable: { status: 'none' },
    }),
  ).toStrictEqual({
    kind: 'task.step_started',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 4,
    task: { stepKey: 'step-2', taskID: 'conversation' },
    thread: 'conversation',
  });
});

test('it names the step of a commit from the step key of the record', () => {
  expect(
    toContractRecord({
      sequence: 9,
      recordedAt: new Date('2026-10-10T12:00:03Z'),
      kind: 'task.step_committed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      stepKey: 'step-2',
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: {
        taskID: 'conversation',
        nextState: 'waiting',
        readCursor: 8,
        sessionBoundary: null,
        timers: [],
      },
      erasable: { status: 'none' },
    }),
  ).toStrictEqual({
    kind: 'task.step_committed',
    recordedAt: new Date('2026-10-10T12:00:03Z'),
    sequence: 9,
    task: { stepKey: 'step-2', taskID: 'conversation' },
    thread: 'conversation',
  });
});

test('it carries the error of a failed step', () => {
  const record = buildMockLogRecord({
    sequence: 12,
    recordedAt: new Date('2026-10-10T12:00:04Z'),
    kind: 'task.step_errored',
    thread: 'conversation',
    payload: {
      taskID: 'conversation',
      stepKey: 'conversation:4',
      nextState: 'ready',
      errors: 1,
      claimableAt: 1_000_000,
    },
    erasable: { status: 'readable', fields: { message: 'the model profile is unreachable' } },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'task.step_errored',
    recordedAt: new Date('2026-10-10T12:00:04Z'),
    sequence: 12,
    task: {
      error: 'the model profile is unreachable',
      errors: 1,
      retryAt: new Date(1_000_000),
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
    thread: 'conversation',
  });
});

test('it carries the errors in a row, the error limit and the retry time of a failed step', () => {
  const record = buildMockLogRecord({
    sequence: 14,
    recordedAt: new Date('2026-10-10T12:00:04Z'),
    kind: 'task.step_errored',
    thread: 'conversation',
    payload: {
      taskID: 'conversation',
      stepKey: 'conversation:4',
      nextState: 'ready',
      errors: 4,
      errorLimit: 3,
      claimableAt: Date.parse('2026-10-10T12:04:04Z'),
    },
    erasable: { status: 'shredded' },
  });

  expect(toContractRecord(record)?.task).toStrictEqual({
    errorLimit: 3,
    errors: 4,
    retryAt: new Date('2026-10-10T12:04:04Z'),
    stepKey: 'conversation:4',
    taskID: 'conversation',
  });
});

test('it keeps a failed step whose error is forgotten with its task and step', () => {
  const record = buildMockLogRecord({
    sequence: 12,
    recordedAt: new Date('2026-10-10T12:00:04Z'),
    kind: 'task.step_errored',
    thread: 'conversation',
    payload: {
      taskID: 'conversation',
      stepKey: 'conversation:4',
      nextState: 'ready',
      errors: 1,
      claimableAt: 1_000_000,
    },
    erasable: { status: 'shredded' },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'task.step_errored',
    recordedAt: new Date('2026-10-10T12:00:04Z'),
    sequence: 12,
    task: {
      errors: 1,
      retryAt: new Date(1_000_000),
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
    thread: 'conversation',
  });
});

test('it carries no error for a task record of another kind', () => {
  const record = buildMockLogRecord({
    sequence: 3,
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    kind: 'task.created',
    thread: 'task-1',
    payload: { taskID: 'task-1' },
    erasable: { status: 'readable', fields: { message: 'a brief' } },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'task.created',
    recordedAt: new Date('2026-10-10T12:00:00Z'),
    sequence: 3,
    task: { taskID: 'task-1' },
    thread: 'task-1',
  });
});

test('it carries a tool call with its tool and input', () => {
  expect(
    toContractRecord({
      sequence: 5,
      recordedAt: new Date('2026-10-10T12:00:01Z'),
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { callID: 'call-1', runID: 'run-1', tool: 'web_fetch', toolUseID: 'use-1' },
      erasable: { status: 'readable', fields: { input: { url: 'https://example.com/' } } },
    }),
  ).toStrictEqual({
    kind: 'tool_called',
    recordedAt: new Date('2026-10-10T12:00:01Z'),
    sequence: 5,
    thread: 'conversation',
    toolCall: { callID: 'call-1', input: { url: 'https://example.com/' }, tool: 'web_fetch' },
  });
});

test('it carries a tool result with its outcome and content', () => {
  expect(
    toContractRecord({
      sequence: 6,
      recordedAt: new Date('2026-10-10T12:00:02Z'),
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      stepKey: null,
      parent: 5,
      contentSource: 'untrusted',
      decision: null,
      promptCause: null,
      approval: null,
      payload: { callID: 'call-1', outcome: 'result', actionID: null, sources: {} },
      erasable: { status: 'readable', fields: { result: { status: 200, text: 'Example Domain' } } },
    }),
  ).toStrictEqual({
    kind: 'tool_result',
    recordedAt: new Date('2026-10-10T12:00:02Z'),
    sequence: 6,
    thread: 'conversation',
    toolCall: {
      callID: 'call-1',
      content: { result: { status: 200, text: 'Example Domain' } },
      outcome: 'result',
    },
  });
});

test('it keeps a forgotten tool result with its outcome and no content', () => {
  expect(
    toContractRecord({
      sequence: 6,
      recordedAt: new Date('2026-10-10T12:00:02Z'),
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      stepKey: null,
      parent: 5,
      contentSource: 'untrusted',
      decision: null,
      promptCause: null,
      approval: null,
      payload: { callID: 'call-1', outcome: 'result', actionID: null, sources: {} },
      erasable: { status: 'shredded' },
    }),
  ).toStrictEqual({
    kind: 'tool_result',
    recordedAt: new Date('2026-10-10T12:00:02Z'),
    sequence: 6,
    thread: 'conversation',
    toolCall: { callID: 'call-1', outcome: 'result' },
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
