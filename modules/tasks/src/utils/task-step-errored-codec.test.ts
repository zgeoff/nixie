import { expect, test } from 'bun:test';
import { taskStepErroredCodec } from './task-step-errored-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskStepErroredCodec.encode({
    taskID: 'task-1',
    stepKey: 'task-1:2',
    nextState: 'ready',
    errors: 2,
    errorLimit: 5,
    claimableAt: 1_030_000,
  });

  expect(taskStepErroredCodec.decode(payload)).toStrictEqual({
    taskID: 'task-1',
    stepKey: 'task-1:2',
    nextState: 'ready',
    errors: 2,
    errorLimit: 5,
    claimableAt: 1_030_000,
  });
});

test('it decodes a failed step from before nixie recorded its step key and limit', () => {
  expect(
    taskStepErroredCodec.decode({
      taskID: 'task-1',
      nextState: 'failed',
      errors: 5,
      claimableAt: 1_030_000,
    }),
  ).toStrictEqual({ taskID: 'task-1', nextState: 'failed', errors: 5, claimableAt: 1_030_000 });
});

test('it refuses an error count that is not a whole number', () => {
  expect(() =>
    taskStepErroredCodec.decode({
      taskID: 'task-1',
      stepKey: 'task-1:2',
      nextState: 'ready',
      errors: 1.5,
      errorLimit: 5,
      claimableAt: 1_030_000,
    }),
  ).toThrow(/"path": \[\s+"errors"\s+\]/u);
});
