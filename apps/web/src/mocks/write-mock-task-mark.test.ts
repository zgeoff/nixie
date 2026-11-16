import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockTaskMark } from './write-mock-task-mark';

test('it switches the mark of an open task and keeps the task open', async () => {
  await store.tasks.create({ disposable: true, state: 'waiting', taskID: 'k3x9m2p7qa' });

  const result = await writeMockTaskMark({
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    disposable: false,
    taskID: 'k3x9m2p7qa',
  });

  const task = store.tasks.findFirst((query) => query.where({ taskID: 'k3x9m2p7qa' }));

  expect(result).toStrictEqual({
    status: 'marked',
    changedAt: expect.toBeValidDate(),
    disposable: false,
    taskID: 'k3x9m2p7qa',
  });

  expect(task).toMatchObject({ disposable: false, state: 'waiting' });
});

test('it answers a repeat of the same change with the first result', async () => {
  await store.tasks.create({ disposable: true, taskID: 'k3x9m2p7qa' });

  const input = {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    disposable: false,
    taskID: 'k3x9m2p7qa',
  };

  const first = await writeMockTaskMark(input);
  const second = await writeMockTaskMark(input);

  expect(second).toStrictEqual(first);
});

test('it refuses a client action ID that another change used', async () => {
  await store.tasks.create({ disposable: true, taskID: 'k3x9m2p7qa' });

  await writeMockTaskMark({
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    disposable: false,
    taskID: 'k3x9m2p7qa',
  });

  const result = await writeMockTaskMark({
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    disposable: true,
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it refuses a task that does not exist', async () => {
  const result = await writeMockTaskMark({
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    disposable: true,
    taskID: 'nosuchtask',
  });

  expect(result).toStrictEqual({ status: 'task_not_found' });
});

test('it refuses a task with no mark', async () => {
  await store.tasks.create({ disposable: null, taskID: 'conversation' });

  const result = await writeMockTaskMark({
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    disposable: true,
    taskID: 'conversation',
  });

  expect(result).toStrictEqual({ status: 'no_mark' });
});

test('it refuses a closed task, with its state', async () => {
  await store.tasks.create({ disposable: true, state: 'closed', taskID: 'k3x9m2p7qa' });

  const result = await writeMockTaskMark({
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    disposable: false,
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toStrictEqual({ status: 'state_refused', state: 'closed' });
});
