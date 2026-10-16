import { expect, test } from 'bun:test';
import { taskStepStartedCodec } from './task-step-started-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskStepStartedCodec.encode({
    taskID: 'task-1',
    stepKey: 'task-1:2',
    generation: 3,
  });

  expect(taskStepStartedCodec.decode(payload)).toStrictEqual({
    taskID: 'task-1',
    stepKey: 'task-1:2',
    generation: 3,
  });
});

test('it refuses a step start that lacks its step key', () => {
  expect(() => taskStepStartedCodec.decode({ taskID: 'task-1', generation: 3 })).toThrow(
    /"path": \[\s+"stepKey"\s+\]/u,
  );
});
