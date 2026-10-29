import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockMove } from './write-mock-move';

test('it moves your message to another task and adds the correction record', async () => {
  await store.tasks.create({ name: 'Garden plan', taskID: 'k3x9m2p7qa' });
  await store.tasks.create({ name: 'Weekend trip', taskID: 'w8d2n5rt1c' });

  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'Book the ferry for Saturday.' },
  });

  await store.records.create({
    kind: 'task.routed',
    route: { messages: [message.sequence], taskID: 'k3x9m2p7qa' },
  });

  const result = await writeMockMove({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
    to: { kind: 'task', taskID: 'w8d2n5rt1c' },
  });

  const corrected = store.records.findFirst((query) =>
    query.where({ kind: 'task.route_corrected' }),
  );

  expect(result).toStrictEqual({
    status: 'moved',
    movedAt: expect.toBeValidDate(),
    taskID: 'w8d2n5rt1c',
  });

  expect(corrected?.route).toStrictEqual({
    isMove: true,
    messages: [message.sequence],
    taskID: 'w8d2n5rt1c',
  });
});

test('it moves your message to a new task with the name you give', async () => {
  const message = await store.records.create({ kind: 'owner_message' });

  const result = await writeMockMove({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
    to: { kind: 'new', name: 'Plumber', brief: 'Find a plumber.' },
  });

  const task = store.tasks.findFirst((query) => query.where({ name: 'Plumber' }));

  expect(result).toMatchObject({ status: 'moved', taskID: task?.taskID });
});

test('it refuses to move a message to the task it already went to', async () => {
  await store.tasks.create({ name: 'Garden plan', taskID: 'k3x9m2p7qa' });

  const message = await store.records.create({ kind: 'owner_message' });

  await store.records.create({
    kind: 'task.routed',
    route: { messages: [message.sequence], taskID: 'k3x9m2p7qa' },
  });

  const result = await writeMockMove({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
    to: { kind: 'task', taskID: 'k3x9m2p7qa' },
  });

  expect(result).toStrictEqual({ status: 'already_there' });
});

test('it refuses to move a message to a task that has finished', async () => {
  await store.tasks.create({ name: 'Garden plan', state: 'done', taskID: 'k3x9m2p7qa' });

  const message = await store.records.create({ kind: 'owner_message' });

  const result = await writeMockMove({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
    to: { kind: 'task', taskID: 'k3x9m2p7qa' },
  });

  expect(result).toStrictEqual({ status: 'task_not_found' });
});

test('it refuses to move a message to a task that runs on its own schedule', async () => {
  await store.tasks.create({
    isTakingMessages: false,
    name: 'Memory writer',
    taskID: 'memory-writer',
  });

  const message = await store.records.create({ kind: 'owner_message' });

  const result = await writeMockMove({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
    to: { kind: 'task', taskID: 'memory-writer' },
  });

  expect(result).toStrictEqual({ status: 'takes_no_messages' });
});

test('it refuses to move a record that is no message of yours', async () => {
  const reply = await store.records.create({ kind: 'model.reply' });

  const result = await writeMockMove({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: reply.sequence,
    thread: 'conversation',
    to: { kind: 'new', name: 'Plumber', brief: 'Find a plumber.' },
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test('it answers a retry with the first move', async () => {
  const message = await store.records.create({ kind: 'owner_message' });

  const input = {
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
    to: { kind: 'new', name: 'Plumber', brief: 'Find a plumber.' },
  } as const;

  const first = await writeMockMove(input);
  const retried = await writeMockMove(input);

  expect(retried).toStrictEqual(first);
});
