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

test('it carries the sequence of the message or reply that a forget names', () => {
  const record = buildMockLogRecord({
    sequence: 12,
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    kind: 'record.forgotten',
    thread: 'conversation',
    payload: { recordSequence: 7 },
  });

  expect(toContractRecord(record)).toStrictEqual({
    forget: { sequence: 7 },
    kind: 'record.forgotten',
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    sequence: 12,
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

test('it shows a failed tool result as cancelled when its action is among the cancelled ones', () => {
  const record = buildMockLogRecord({
    kind: 'tool_result',
    thread: 'conversation',
    payload: { callID: 'call-1', outcome: 'failed', actionID: 'action-1', sources: {} },
    erasable: { status: 'shredded' },
  });

  expect(toContractRecord(record, new Set(['action-1']))?.toolCall).toStrictEqual({
    callID: 'call-1',
    outcome: 'cancelled',
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

test('it carries the context a turn end recorded for its last model call', () => {
  const record = buildMockLogRecord({
    sequence: 21,
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    kind: 'model.turn_ended',
    thread: 'conversation',
    payload: {
      model: 'claude-test-1',
      profile: 'chat-direct',
      inputTokens: 500,
      contextSize: 41_000,
      contextWindow: 400_000,
    },
  });

  expect(toContractRecord(record)).toStrictEqual({
    context: { size: 41_000, window: 400_000 },
    kind: 'model.turn_ended',
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    sequence: 21,
    thread: 'conversation',
  });
});

test('it carries no context on a turn end recorded before the context was', () => {
  const record = buildMockLogRecord({
    sequence: 21,
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    kind: 'model.turn_ended',
    thread: 'conversation',
    payload: { model: 'claude-test-1', profile: 'chat-direct', inputTokens: 500 },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'model.turn_ended',
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    sequence: 21,
    thread: 'conversation',
  });
});

test('it carries a compaction with its trigger and its token counts before and after', () => {
  const record = buildMockLogRecord({
    sequence: 20,
    recordedAt: new Date('2026-10-10T12:00:04Z'),
    kind: 'model.compacted',
    thread: 'conversation',
    payload: {
      model: 'claude-test-1',
      profile: 'chat-direct',
      trigger: 'auto',
      preTokens: 384_000,
      postTokens: 42_000,
    },
  });

  expect(toContractRecord(record)).toStrictEqual({
    compaction: { postTokens: 42_000, preTokens: 384_000, trigger: 'auto' },
    kind: 'model.compacted',
    recordedAt: new Date('2026-10-10T12:00:04Z'),
    sequence: 20,
    thread: 'conversation',
  });
});

test('it carries a compaction whose session reported no after count without one', () => {
  const record = buildMockLogRecord({
    sequence: 20,
    recordedAt: new Date('2026-10-10T12:00:04Z'),
    kind: 'model.compacted',
    thread: 'conversation',
    payload: { trigger: 'manual', preTokens: 384_000, postTokens: null },
  });

  expect(toContractRecord(record)?.compaction).toStrictEqual({
    preTokens: 384_000,
    trigger: 'manual',
  });
});

test('it carries a summary with its trigger, its sizes and its text', () => {
  const record = buildMockLogRecord({
    sequence: 21,
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    kind: 'model.session_summarized',
    thread: 'conversation',
    payload: {
      model: 'claude-test-1',
      profile: 'chat-direct',
      throughSequence: 20,
      trigger: 'threshold',
      contextSize: 165_000,
      summaryTokens: 1200,
      isCut: false,
    },
    erasable: { status: 'readable', fields: { text: 'Open threads: the gauge report.' } },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'model.session_summarized',
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    sequence: 21,
    summary: {
      contextSize: 165_000,
      summaryTokens: 1200,
      text: 'Open threads: the gauge report.',
      trigger: 'threshold',
    },
    thread: 'conversation',
  });
});

test('it carries a summary a forget erased with no text', () => {
  const record = buildMockLogRecord({
    kind: 'model.session_summarized',
    thread: 'conversation',
    payload: { trigger: 'overflow', summaryTokens: 1200 },
    erasable: { status: 'shredded' },
  });

  expect(toContractRecord(record)?.summary).toStrictEqual({
    summaryTokens: 1200,
    trigger: 'overflow',
  });
});

test('it carries the failures in a row of a failed compaction, and never its error', () => {
  const record = buildMockLogRecord({
    sequence: 22,
    recordedAt: new Date('2026-10-10T12:00:06Z'),
    kind: 'model.compaction_failed',
    thread: 'conversation',
    payload: { trigger: 'threshold', failures: 2 },
    erasable: { status: 'readable', fields: { message: 'the summary call failed' } },
  });

  expect(toContractRecord(record)).toStrictEqual({
    compactionFailure: { failures: 2 },
    kind: 'model.compaction_failed',
    recordedAt: new Date('2026-10-10T12:00:06Z'),
    sequence: 22,
    thread: 'conversation',
  });
});

test('it carries the versions a recall delivered with their scores, and no text', () => {
  const record = buildMockLogRecord({
    sequence: 11,
    recordedAt: new Date('2026-10-10T12:00:02Z'),
    kind: 'memory.recalled',
    thread: 'conversation',
    payload: {
      items: [
        { itemID: 'item-a', version: 2, score: 0.61 },
        { itemID: 'item-b', version: 1 },
      ],
    },
    erasable: { status: 'none' },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'memory.recalled',
    recall: {
      items: [
        { itemID: 'item-a', version: 2, score: 0.61 },
        { itemID: 'item-b', version: 1 },
      ],
    },
    recordedAt: new Date('2026-10-10T12:00:02Z'),
    sequence: 11,
    thread: 'conversation',
  });
});

test('it carries no versions for a recall whose items do not fit its codec', () => {
  const record = buildMockLogRecord({
    sequence: 11,
    recordedAt: new Date('2026-10-10T12:00:02Z'),
    kind: 'memory.recalled',
    thread: 'conversation',
    payload: { items: [{ itemID: 'item-a', version: 2 }, { itemID: 'item-c' }] },
    erasable: { status: 'none' },
  });

  expect(toContractRecord(record)?.recall).toStrictEqual({ items: [] });
});

test('it carries each rating with its verdict and whether a note waits, and never the sealed note', () => {
  const record = buildMockLogRecord({
    sequence: 14,
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    kind: 'memory.rated',
    thread: 'conversation',
    payload: {
      ratingID: 'rating-a',
      recalledSequence: 11,
      runID: 'run-1',
      ratedBy: 'Pip',
      ratings: [
        { itemID: 'item-a', version: 2, verdict: 'noise', sealedNote: 'c2VhbGVk' },
        { itemID: 'item-b', version: 1, verdict: 'helpful' },
      ],
    },
    erasable: { status: 'none' },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'memory.rated',
    rating: {
      items: [
        { hasNote: true, itemID: 'item-a', verdict: 'noise', version: 2 },
        { hasNote: false, itemID: 'item-b', verdict: 'helpful', version: 1 },
      ],
      ratedBy: 'Pip',
      recalledSequence: 11,
    },
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    sequence: 14,
    thread: 'conversation',
  });
});

test('it gives no rating for a rating record with a verdict outside the scale', () => {
  const record = buildMockLogRecord({
    sequence: 14,
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    kind: 'memory.rated',
    thread: 'conversation',
    payload: {
      ratingID: 'rating-a',
      recalledSequence: 11,
      runID: 'run-1',
      ratings: [{ itemID: 'item-c', version: 1, verdict: 'missing' }],
    },
    erasable: { status: 'none' },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'memory.rated',
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    sequence: 14,
    thread: 'conversation',
  });
});

test('it gives no rating for a rating record that names no recall', () => {
  const record = buildMockLogRecord({
    sequence: 14,
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    kind: 'memory.rated',
    thread: 'conversation',
    payload: { ratings: [{ itemID: 'item-a', version: 2, verdict: 'noise' }] },
    erasable: { status: 'none' },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'memory.rated',
    recordedAt: new Date('2026-10-10T12:00:05Z'),
    sequence: 14,
    thread: 'conversation',
  });
});

test('it carries a kept moment with its IDs and its title', () => {
  const record = buildMockLogRecord({
    sequence: 15,
    recordedAt: new Date('2026-10-10T12:00:06Z'),
    kind: 'moment_kept',
    thread: 'conversation',
    payload: {
      momentID: '5d1c9e2a-7b3f-4a6d-8c0e-1f2a3b4c5d6e',
      shortID: 'q4n8v2hw6t',
      thread: 'conversation',
      firstSequence: 3,
      lastSequence: 9,
      keptBy: 'model',
      keptThread: 'conversation',
      model: 'claude-test-4',
    },
    erasable: { status: 'readable', fields: { title: 'The ladder on the stairs' } },
  });

  expect(toContractRecord(record)).toStrictEqual({
    kind: 'moment_kept',
    moment: {
      momentID: '5d1c9e2a-7b3f-4a6d-8c0e-1f2a3b4c5d6e',
      shortID: 'q4n8v2hw6t',
      title: 'The ladder on the stairs',
    },
    recordedAt: new Date('2026-10-10T12:00:06Z'),
    sequence: 15,
    thread: 'conversation',
  });
});

test('it carries a destroyed moment with its IDs and no title', () => {
  const record = buildMockLogRecord({
    sequence: 15,
    recordedAt: new Date('2026-10-10T12:00:06Z'),
    kind: 'moment_kept',
    thread: 'conversation',
    payload: {
      momentID: '5d1c9e2a-7b3f-4a6d-8c0e-1f2a3b4c5d6e',
      shortID: 'q4n8v2hw6t',
      thread: 'conversation',
      firstSequence: 3,
      lastSequence: 9,
      keptBy: 'model',
      keptThread: 'conversation',
      model: 'claude-test-4',
    },
    erasable: { status: 'shredded' },
  });

  expect(toContractRecord(record)?.moment).toStrictEqual({
    momentID: '5d1c9e2a-7b3f-4a6d-8c0e-1f2a3b4c5d6e',
    shortID: 'q4n8v2hw6t',
  });
});
