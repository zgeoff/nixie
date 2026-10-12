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

test('it carries the model reply with its text', () => {
  expect(
    toContractRecord({
      sequence: 9,
      recordedAt: new Date('2026-10-10T12:00:01Z'),
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { model: 'claude-test-1', profile: 'chat-direct' },
      erasable: { status: 'readable', fields: { text: 'Hello.' } },
    }),
  ).toStrictEqual({
    kind: 'model.reply',
    message: { text: 'Hello.' },
    recordedAt: new Date('2026-10-10T12:00:01Z'),
    sequence: 9,
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
