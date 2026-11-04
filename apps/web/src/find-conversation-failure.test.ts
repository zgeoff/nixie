import { expect, test } from 'bun:test';
import { findConversationFailure } from './find-conversation-failure';
import { buildMockLogRecord } from './test-utils/build-mock-log-record';

test('it finds the conversation failing once its errors in a row reach the limit', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 3,
      retryAt: new Date('2026-10-14T09:04:00Z'),
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  });

  expect(findConversationFailure([errored])).toStrictEqual({
    errors: 3,
    cause: null,
    retryAt: new Date('2026-10-14T09:04:00Z'),
  });
});

test('it finds no failure while the errors in a row stay under the limit', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 2,
      retryAt: new Date('2026-10-14T09:01:00Z'),
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  });

  expect(findConversationFailure([errored])).toBeNull();
});

test('it finds no failure once a step commits after the errors', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    sequence: 10,
    task: {
      errorLimit: 3,
      errors: 3,
      retryAt: new Date('2026-10-14T09:04:00Z'),
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  });

  const committed = buildMockLogRecord({
    kind: 'task.step_committed',
    sequence: 12,
    task: { stepKey: 'conversation:4', taskID: 'conversation' },
  });

  expect(findConversationFailure([errored, committed])).toBeNull();
});

test('it reads past the records that end no step, such as your next message', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    sequence: 10,
    task: {
      errorLimit: 3,
      errors: 4,
      retryAt: new Date('2026-10-14T09:08:00Z'),
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  });

  const message = buildMockLogRecord({
    kind: 'owner_message',
    message: { text: 'Are you there?' },
    sequence: 11,
  });

  expect(findConversationFailure([errored, message])).toStrictEqual({
    errors: 4,
    cause: null,
    retryAt: new Date('2026-10-14T09:08:00Z'),
  });
});

test('it finds a turn the model API refused at its first failure, with the cause and the retry time', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 1,
      reason: 'model_api.overloaded',
      retryAt: new Date('2026-10-14T09:01:00Z'),
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  });

  expect(findConversationFailure([errored])).toStrictEqual({
    errors: 1,
    cause: 'Claude is overloaded',
    retryAt: new Date('2026-10-14T09:01:00Z'),
  });
});

test('it finds a turn that waits for your retry with no retry time', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 1,
      isWaitingForRetry: true,
      reason: 'model_api.quota',
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  });

  expect(findConversationFailure([errored])).toStrictEqual({
    errors: 1,
    cause: 'Claude quota reached',
    retryAt: null,
  });
});

test('it finds no failure once you retried the failed turn', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    sequence: 10,
    task: {
      errorLimit: 3,
      errors: 1,
      isWaitingForRetry: true,
      reason: 'model_api.quota',
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  });

  const revived = buildMockLogRecord({
    kind: 'task.revived',
    sequence: 11,
    task: { taskID: 'conversation' },
  });

  expect(findConversationFailure([errored, revived])).toBeNull();
});

test('it finds no failure for an error recorded before the limit was', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errors: 3,
      retryAt: new Date('2026-10-14T09:04:00Z'),
      stepKey: 'conversation:4',
      taskID: 'conversation',
    },
  });

  expect(findConversationFailure([errored])).toBeNull();
});
