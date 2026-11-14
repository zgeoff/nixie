import { expect, test } from 'bun:test';
import { taskInterruptedCodec } from './task-interrupted-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskInterruptedCodec.encode({
    taskID: 'conversation',
    stepKey: 'conversation:7',
  });

  expect(taskInterruptedCodec.decode(payload)).toStrictEqual({
    taskID: 'conversation',
    stepKey: 'conversation:7',
  });
});

test('it refuses a payload that names no step', () => {
  expect(() => taskInterruptedCodec.decode({ taskID: 'conversation' })).toThrow(
    /"path": \[\s+"stepKey"\s+\]/u,
  );
});
