import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { defaultAPISettings } from './default-api-settings';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

test('#tasks.list lists the conversation and each started task with its name and brief', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await writeRecords(api.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  const listed = await client.tasks.list({});

  expect(listed.tasks).toIncludeSameMembers([
    {
      brief: 'Talks with the owner and answers each message.',
      isPauseRequested: false,
      isTakingMessages: true,
      lastActivityAt: expect.toBeValidDate(),
      name: 'Conversation',
      state: expect.toBeString(),
      taskID: 'conversation',
    },
    {
      brief: 'Plan the beds.',
      isPauseRequested: false,
      isTakingMessages: true,
      lastActivityAt: expect.toBeValidDate(),
      name: 'Garden plan',
      state: 'waiting',
      taskID: 'k3x9m2p7qa',
    },
  ]);
});

test('#tasks.list marks a task that runs on its own schedule as taking no message of yours', async () => {
  const api = await startTestAPI({
    ...defaultAPISettings,
    taskDirectory: [
      {
        taskID: 'memory-writer',
        name: 'Memory writer',
        brief: 'Saves what you say as memory.',
        isWokenByMessages: false,
      },
    ],
  });

  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await writeRecords(api.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { taskID: 'memory-writer', isConversation: false, state: 'waiting' },
    },
  ]);

  const listed = await client.tasks.list({});

  expect(listed.tasks.map((task) => [task.taskID, task.isTakingMessages])).toStrictEqual([
    ['memory-writer', false],
  ]);
});

test('#tasks.list refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const stranger = buildTestClient(api.url);

  expect(stranger.tasks.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#tasks.pause pauses a waiting task and records the pause', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  const paused = await client.tasks.pause({
    clientActionID: '2c4e6a8b-1d3f-4b5c-8e7a-9f0b1c2d3e4f',
    taskID: 'conversation',
  });

  const records = await readRecords(api.context.log, { afterSequence: 0, thread: 'conversation' });

  expect(paused).toStrictEqual({
    controlledAt: new Date(1_000_000),
    isPauseRequested: false,
    state: 'paused',
    taskID: 'conversation',
  });

  expect(records.at(-1)?.record).toMatchObject({
    kind: 'task.paused',
    payload: { taskID: 'conversation', resumeState: 'waiting' },
  });
});

test('#tasks.resume answers a repeat of the same action with the first result, and resumes once', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await client.tasks.pause({
    clientActionID: '2c4e6a8b-1d3f-4b5c-8e7a-9f0b1c2d3e4f',
    taskID: 'conversation',
  });

  const first = await client.tasks.resume({
    clientActionID: '3d5f7b9c-2e4a-4c6d-9f8b-0a1c2d3e4f5a',
    taskID: 'conversation',
  });

  const repeat = await client.tasks.resume({
    clientActionID: '3d5f7b9c-2e4a-4c6d-9f8b-0a1c2d3e4f5a',
    taskID: 'conversation',
  });

  const records = await readRecords(api.context.log, { afterSequence: 0, thread: 'conversation' });

  expect(repeat).toStrictEqual(first);
  expect(records.filter((entry) => entry.record.kind === 'task.resumed')).toHaveLength(1);
});

test('#tasks.stop refuses a client action ID that another control used', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await client.tasks.pause({
    clientActionID: '2c4e6a8b-1d3f-4b5c-8e7a-9f0b1c2d3e4f',
    taskID: 'conversation',
  });

  const refused = await client.tasks
    .stop({
      clientActionID: '2c4e6a8b-1d3f-4b5c-8e7a-9f0b1c2d3e4f',
      taskID: 'conversation',
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#tasks.restart refuses a task whose state takes no restart, with the state', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  const refused = await client.tasks
    .restart({
      clientActionID: '4e6a8c0d-3f5b-4d7e-8a9c-1b2d3e4f5a6b',
      taskID: 'conversation',
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({
    code: 'TASK_STATE_REFUSED',
    data: { isPauseRequested: false, state: 'waiting' },
  });
});

test('#tasks.interrupt refuses a task that does not exist', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  const refused = await client.tasks
    .interrupt({
      clientActionID: '5f7b9d1e-4a6c-4e8f-9b0d-2c3e4f5a6b7c',
      taskID: 'k3x9m2p7qa',
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({ code: 'TASK_NOT_FOUND' });
});

test('#tasks.close closes a started task', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await writeRecords(api.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: { taskID: 'k3x9m2p7qa', isConversation: false, state: 'waiting' },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  const closed = await client.tasks.close({
    clientActionID: '6a8c0e2f-5b7d-4f9a-8c1e-3d4f5a6b7c8d',
    taskID: 'k3x9m2p7qa',
  });

  expect(closed.state).toBe('closed');
});

test('#tasks.close refuses to close the conversation', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  const refused = await client.tasks
    .close({
      clientActionID: '7b9d1f3a-6c8e-4a0b-9d2f-4e5a6b7c8d9e',
      taskID: 'conversation',
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({ code: 'CONVERSATION_NEVER_CLOSES' });
});

test('#tasks.pause refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const stranger = buildTestClient(api.url);

  const refused = await stranger.tasks
    .pause({
      clientActionID: '8c0e2a4b-7d9f-4b1c-8e3a-5f6b7c8d9e0f',
      taskID: 'conversation',
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({ code: 'UNAUTHORIZED' });
});
