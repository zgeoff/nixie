import { expect, test } from 'bun:test';
import { pauseStore } from './pause-store';
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
    changesAt: null,
    readAtSequence: record.sequence,
    tasks: [
      {
        actions: { cancelled: 0, queued: 0, started: 0 },
        brief: 'Order seeds.',
        closedBy: undefined,
        controls: ['stop'],
        definitionID: undefined,
        disposable: null,
        fire: undefined,
        isPauseRequested: false,
        isPausedByNixie: false,
        isTakingMessages: true,
        lastActivityAt: new Date('2026-10-02T09:00:00Z'),
        listedState: undefined,
        name: 'Seed order',
        nextRunAt: undefined,
        runner: 'sandbox',
        session: undefined,
        state: 'running',
        taskID: 'w5n1c8d3ra',
        wakeable: undefined,
        waitingOn: undefined,
      },
      {
        actions: { cancelled: 1, queued: 1, started: 1 },
        brief: 'Plan the beds.',
        closedBy: undefined,
        controls: ['pause', 'resume', 'stop', 'restart', 'close', 'interrupt'],
        definitionID: undefined,
        disposable: null,
        fire: undefined,
        isPauseRequested: false,
        isPausedByNixie: false,
        isTakingMessages: true,
        lastActivityAt: new Date('2026-10-01T09:00:00Z'),
        listedState: undefined,
        name: 'Garden plan',
        nextRunAt: undefined,
        runner: 'sandbox',
        session: undefined,
        state: 'waiting',
        taskID: 'k3x9m2p7qa',
        wakeable: undefined,
        waitingOn: 'conversation',
      },
    ],
  });
});

test('it marks each task as paused by nixie while the pause holds, except an exempt one', async () => {
  await store.tasks.create({ taskID: 'k3x9m2p7qa' });
  await store.tasks.create({ taskID: 'w5n1c8d3ra' });
  await pauseStore.pauses.create({ cause: 'owner' });
  await pauseStore.pauseExemptions.create({ taskID: 'w5n1c8d3ra' });

  const marks = readMockTaskList().tasks.map((task) => [task.taskID, task.isPausedByNixie]);

  expect(marks).toIncludeSameMembers([
    ['k3x9m2p7qa', true],
    ['w5n1c8d3ra', false],
  ]);
});

test('it lists a paused task as paused while nixie is paused, and an ended one as it is', async () => {
  await store.tasks.create({ listedState: 'idle', state: 'waiting', taskID: 'k3x9m2p7qa' });
  await store.tasks.create({ listedState: 'failed', state: 'failed', taskID: 'w5n1c8d3ra' });
  await pauseStore.pauses.create({ cause: 'owner' });

  const states = readMockTaskList().tasks.map((task) => [task.taskID, task.listedState]);

  expect(states).toIncludeSameMembers([
    ['k3x9m2p7qa', 'paused'],
    ['w5n1c8d3ra', 'failed'],
  ]);
});

test('it filters by definition and by listed state, before the limit of 100', async () => {
  await store.tasks.create({
    definitionID: 'water-the-tomatoes',
    lastActivityAt: new Date('2026-09-01T09:00:00Z'),
    listedState: 'asleep',
    taskID: 'k3x9m2p7qa',
  });

  for (let index = 0; index < 101; index += 1) {
    await store.tasks.create({
      lastActivityAt: new Date('2026-10-01T09:00:00Z'),
      listedState: 'idle',
    });
  }

  const byDefinition = readMockTaskList({ definitionID: 'water-the-tomatoes' });
  const byState = readMockTaskList({ states: ['asleep', 'failed'] });

  expect(byDefinition.tasks.map((task) => task.taskID)).toStrictEqual(['k3x9m2p7qa']);
  expect(byState.tasks.map((task) => task.taskID)).toStrictEqual(['k3x9m2p7qa']);
});
