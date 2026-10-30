import { expect, test } from 'bun:test';
import { readMockTaskActions } from './read-mock-task-actions';
import { store } from './store';

test('it splits the uncancelled actions of a task into queued and started', async () => {
  await store.tasks.create({ taskID: 'k3x9m2p7qa' });

  await store.taskActions.create({
    actionID: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24',
    taskID: 'k3x9m2p7qa',
    tool: 'test.send',
  });

  await store.taskActions.create({
    actionID: '6e8a0c2d-4f3b-4d7e-9a1c-2b4d6f8a0c3e',
    attempts: 1,
    taskID: 'k3x9m2p7qa',
    tool: 'test.archive',
  });

  await store.taskActions.create({ isCancelled: true, taskID: 'k3x9m2p7qa' });

  expect(readMockTaskActions('k3x9m2p7qa')).toStrictEqual({
    queued: [{ actionID: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24', tool: 'test.send' }],
    started: [{ actionID: '6e8a0c2d-4f3b-4d7e-9a1c-2b4d6f8a0c3e', tool: 'test.archive' }],
  });
});

test('it reads nothing for a task that does not exist', () => {
  expect(readMockTaskActions('k3x9m2p7qa')).toBeNull();
});
