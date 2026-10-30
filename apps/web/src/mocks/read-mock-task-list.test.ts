import { expect, test } from 'bun:test';
import { readMockTaskList } from './read-mock-task-list';
import { store } from './store';

test('it lists each task, most recently active first, with its action counts', async () => {
  await store.tasks.create({
    brief: 'Plan the beds.',
    lastActivityAt: new Date('2026-10-01T09:00:00Z'),
    name: 'Garden plan',
    state: 'waiting',
    taskID: 'k3x9m2p7qa',
    waitingOn: 'conversation',
  });

  await store.tasks.create({
    brief: 'Order seeds.',
    controls: ['stop'],
    lastActivityAt: new Date('2026-10-02T09:00:00Z'),
    name: 'Seed order',
    state: 'running',
    taskID: 'w5n1c8d3ra',
  });

  await store.taskActions.create({ taskID: 'k3x9m2p7qa' });
  await store.taskActions.create({ taskID: 'k3x9m2p7qa', attempts: 1 });
  await store.taskActions.create({ taskID: 'k3x9m2p7qa', isCancelled: true });

  const record = await store.records.create({ kind: 'task.paused', thread: 'k3x9m2p7qa' });

  expect(readMockTaskList()).toStrictEqual({
    readAtSequence: record.sequence,
    tasks: [
      {
        actions: { cancelled: 0, queued: 0, started: 0 },
        brief: 'Order seeds.',
        controls: ['stop'],
        isPauseRequested: false,
        isTakingMessages: true,
        lastActivityAt: new Date('2026-10-02T09:00:00Z'),
        name: 'Seed order',
        state: 'running',
        taskID: 'w5n1c8d3ra',
        waitingOn: undefined,
      },
      {
        actions: { cancelled: 1, queued: 1, started: 1 },
        brief: 'Plan the beds.',
        controls: ['pause', 'resume', 'stop', 'restart', 'close', 'interrupt'],
        isPauseRequested: false,
        isTakingMessages: true,
        lastActivityAt: new Date('2026-10-01T09:00:00Z'),
        name: 'Garden plan',
        state: 'waiting',
        taskID: 'k3x9m2p7qa',
        waitingOn: 'conversation',
      },
    ],
  });
});
