import { expect, test } from 'bun:test';
import { pauseStore } from './pause-store';
import { probeMockTaskPaused } from './probe-mock-task-paused';
import { store } from './store';
import { writeMockTaskControl } from './write-mock-task-control';

test('it pauses a waiting task', async () => {
  await store.tasks.create({ state: 'waiting', taskID: 'k3x9m2p7qa' });

  const result = await writeMockTaskControl('pause', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toStrictEqual({
    status: 'controlled',
    controlledAt: expect.toBeValidDate(),
    isPauseRequested: false,
    state: 'paused',
    taskID: 'k3x9m2p7qa',
  });
});

test('it asks a running task to pause once its step ends', async () => {
  await store.tasks.create({ state: 'running', taskID: 'k3x9m2p7qa' });

  const result = await writeMockTaskControl('pause', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toMatchObject({ status: 'controlled', state: 'running', isPauseRequested: true });
});

test('it refuses a restart of a waiting task, with its state', async () => {
  await store.tasks.create({ state: 'waiting', taskID: 'k3x9m2p7qa' });

  const result = await writeMockTaskControl('restart', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toStrictEqual({
    status: 'state_refused',
    state: 'waiting',
    isPauseRequested: false,
  });
});

test('it refuses to close the conversation', async () => {
  await store.tasks.create({ taskID: 'conversation' });

  const result = await writeMockTaskControl('close', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'conversation',
  });

  expect(result).toStrictEqual({ status: 'conversation_never_closes' });
});

test('it refuses a control that the runner of the task lacks', async () => {
  await store.tasks.create({ taskID: 'k3x9m2p7qa', controls: ['pause'], state: 'waiting' });

  const result = await writeMockTaskControl('stop', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toStrictEqual({ status: 'runner_lacks_control' });
});

test('it refuses a control of a task the store does not hold', async () => {
  const result = await writeMockTaskControl('stop', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toStrictEqual({ status: 'task_not_found' });
});

test('it replays the first result of a repeated control after the task moved on', async () => {
  await store.tasks.create({ state: 'ready', taskID: 'k3x9m2p7qa' });

  const first = await writeMockTaskControl('pause', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  await writeMockTaskControl('resume', {
    clientActionID: '7e9a1c3b-5d2f-4a8e-9c6b-0f1d3e5a7c92',
    taskID: 'k3x9m2p7qa',
  });

  const repeat = await writeMockTaskControl('pause', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(repeat).toStrictEqual(first);
});

test('it returns a paused waiting task to waiting on a resume', async () => {
  await store.tasks.create({ state: 'waiting', taskID: 'k3x9m2p7qa' });

  await writeMockTaskControl('pause', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  const result = await writeMockTaskControl('resume', {
    clientActionID: '7e9a1c3b-5d2f-4a8e-9c6b-0f1d3e5a7c92',
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toMatchObject({ status: 'controlled', state: 'waiting' });
});

test('it cancels the unstarted actions of a task it stops and leaves a started one', async () => {
  await store.tasks.create({ state: 'running', taskID: 'k3x9m2p7qa' });
  await store.taskActions.create({ taskID: 'k3x9m2p7qa', tool: 'test.send' });
  await store.taskActions.create({ attempts: 1, taskID: 'k3x9m2p7qa', tool: 'test.archive' });

  await writeMockTaskControl('stop', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(
    store.taskActions
      .all()
      .map((action) => ({ isCancelled: action.isCancelled, tool: action.tool })),
  ).toIncludeSameMembers([
    { isCancelled: true, tool: 'test.send' },
    { isCancelled: false, tool: 'test.archive' },
  ]);
});

test('it refuses a client action ID that another control used', async () => {
  await store.tasks.create({ state: 'waiting', taskID: 'k3x9m2p7qa' });

  await writeMockTaskControl('pause', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  const result = await writeMockTaskControl('stop', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it exempts a ready task that nixie stopped, and leaves its state', async () => {
  await store.tasks.create({ state: 'ready', taskID: 'k3x9m2p7qa' });
  await pauseStore.pauses.create({ cause: 'restore' });

  const result = await writeMockTaskControl('resume', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toStrictEqual({
    status: 'controlled',
    controlledAt: expect.toBeValidDate(),
    isPauseRequested: false,
    state: 'ready',
    taskID: 'k3x9m2p7qa',
  });

  expect(probeMockTaskPaused('k3x9m2p7qa')).toBeFalse();
});

test('it resumes a task that is paused on its own and nixie stopped, and exempts it', async () => {
  await store.tasks.create({ state: 'paused', resumeState: 'waiting', taskID: 'k3x9m2p7qa' });
  await pauseStore.pauses.create({ cause: 'owner' });

  const result = await writeMockTaskControl('resume', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(result).toMatchObject({ status: 'controlled', state: 'waiting' });
  expect(probeMockTaskPaused('k3x9m2p7qa')).toBeFalse();
});

test('it leaves the other tasks paused when one task resumes', async () => {
  await store.tasks.create({ state: 'ready', taskID: 'k3x9m2p7qa' });
  await store.tasks.create({ state: 'ready', taskID: 'w5n1c8d3ra' });
  await pauseStore.pauses.create({ cause: 'owner' });

  await writeMockTaskControl('resume', {
    clientActionID: '1a3c5e7f-9b2d-4f6a-8c0e-2d4f6a8b0c1e',
    taskID: 'k3x9m2p7qa',
  });

  expect(probeMockTaskPaused('w5n1c8d3ra')).toBeTrue();
});
