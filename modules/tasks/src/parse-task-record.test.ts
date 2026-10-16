import { expect, test } from 'bun:test';
import { parseTaskRecord } from './parse-task-record';

test('it reads a step commit with its timers', () => {
  const parsed = parseTaskRecord({
    sequence: 9,
    recordedAt: new Date(0),
    kind: 'task.step_committed',
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'task-1',
    stepKey: 'task-1:2',
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: null,
    payload: {
      taskID: 'task-1',
      nextState: 'waiting',
      readCursor: 7,
      sessionBoundary: null,
      timers: [{ timerID: 'timer-1', dueAt: 2_000_000 }],
    },
  });

  expect(parsed).toStrictEqual({
    kind: 'task.step_committed',
    taskID: 'task-1',
    nextState: 'waiting',
    readCursor: 7,
    sessionBoundary: null,
    timers: [{ timerID: 'timer-1', dueAt: 2_000_000 }],
  });
});

test('it reads a record of another kind as no task record', () => {
  const parsed = parseTaskRecord({
    sequence: 9,
    recordedAt: new Date(0),
    kind: 'turn_finished',
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

test('it refuses a task record whose payload does not fit its kind, naming the record', () => {
  expect(() =>
    parseTaskRecord({
      sequence: 9,
      recordedAt: new Date(0),
      kind: 'task.step_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-1',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { taskID: 'task-1', generation: 1 },
    }),
  ).toThrowWithMessage(Error, 'record 9 of kind task.step_started does not fit its payload');
});
