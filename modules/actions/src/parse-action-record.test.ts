import { expect, test } from 'bun:test';
import { parseActionRecord } from './parse-action-record';

test('it reads an outcome record', () => {
  const parsed = parseActionRecord({
    sequence: 9,
    recordedAt: new Date(0),
    kind: 'action.outcome',
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'task-1',
    stepKey: null,
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: null,
    payload: { actionID: 'action-1', status: 'unknown', attempt: 2, reason: 'ambiguous' },
  });

  expect(parsed).toStrictEqual({
    kind: 'action.outcome',
    actionID: 'action-1',
    status: 'unknown',
    reason: 'ambiguous',
  });
});

test('it reads a record of another kind as no action record', () => {
  const parsed = parseActionRecord({
    sequence: 9,
    recordedAt: new Date(0),
    kind: 'task.created',
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'task-1',
    stepKey: null,
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: null,
    payload: {},
  });

  expect(parsed).toBeNull();
});

test('it refuses an outcome record with a status outside the settled statuses', () => {
  expect(() =>
    parseActionRecord({
      sequence: 9,
      recordedAt: new Date(0),
      kind: 'action.outcome',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-1',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { actionID: 'action-1', status: 'pending', attempt: 1, reason: null },
    }),
  ).toThrowWithMessage(TypeError, 'expected a settled action status, got pending');
});

test('it refuses an action record that lacks a field', () => {
  expect(() =>
    parseActionRecord({
      sequence: 9,
      recordedAt: new Date(0),
      kind: 'action.attempt_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-1',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { actionID: 'action-1' },
    }),
  ).toThrowWithMessage(Error, 'record 9 of kind action.attempt_started lacks attempt');
});
