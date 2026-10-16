import { expect, test } from 'bun:test';
import { taskStepCommittedCodec } from './task-step-committed-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskStepCommittedCodec.encode({
    taskID: 'task-1',
    nextState: 'waiting',
    readCursor: 7,
    sessionBoundary: 'boundary-1',
    timers: [{ timerID: 'timer-1', dueAt: 2_000_000 }],
  });

  expect(taskStepCommittedCodec.decode(payload)).toStrictEqual({
    taskID: 'task-1',
    nextState: 'waiting',
    readCursor: 7,
    sessionBoundary: 'boundary-1',
    timers: [{ timerID: 'timer-1', dueAt: 2_000_000 }],
  });
});

test('it refuses a step commit whose timers are not a list', () => {
  expect(() =>
    taskStepCommittedCodec.decode({
      taskID: 'task-1',
      nextState: 'waiting',
      readCursor: 7,
      sessionBoundary: null,
      timers: { timerID: 'timer-1', dueAt: 2_000_000 },
    }),
  ).toThrow(/"path": \[\s+"timers"\s+\]/u);
});
