import { expect, test } from 'bun:test';
import { taskStepInterruptedCodec } from './task-step-interrupted-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskStepInterruptedCodec.encode({ taskID: 'task-1', stepKey: 'task-1:2' });

  expect(taskStepInterruptedCodec.decode(payload)).toStrictEqual({
    taskID: 'task-1',
    stepKey: 'task-1:2',
  });
});

test('it refuses a step key that is not a string', () => {
  expect(() => taskStepInterruptedCodec.decode({ taskID: 'task-1', stepKey: 2 })).toThrow(
    /"path": \[\s+"stepKey"\s+\]/u,
  );
});
