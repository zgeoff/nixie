import { expect, test } from 'bun:test';
import { taskCreatedCodec } from './task-created-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskCreatedCodec.encode({
    taskID: 'task-1',
    isConversation: true,
    state: 'waiting',
  });

  expect(taskCreatedCodec.decode(payload)).toStrictEqual({
    taskID: 'task-1',
    isConversation: true,
    state: 'waiting',
  });
});

test('it decodes the task that started a task', () => {
  const payload = taskCreatedCodec.encode({
    taskID: 'k3x9m2p7qa',
    isConversation: false,
    state: 'ready',
    startedBy: 'conversation',
  });

  expect(taskCreatedCodec.decode(payload)).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    isConversation: false,
    state: 'ready',
    startedBy: 'conversation',
  });
});

test('it refuses a state outside the task states', () => {
  expect(() =>
    taskCreatedCodec.decode({ taskID: 'task-1', isConversation: false, state: 'sleeping' }),
  ).toThrow(/"path": \[\s+"state"\s+\]/u);
});
