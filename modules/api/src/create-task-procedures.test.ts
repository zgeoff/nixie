import { expect, test } from 'bun:test';
import type { ActionsTables } from '@heynixie/actions';
import { readRecords, writeRecords } from '@heynixie/log';
import { registerFaultPointAction } from '@heynixie/memory/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
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
      actions: { cancelled: 0, queued: 0, started: 0 },
      brief: 'Talks with the owner and answers each message.',
      controls: ['pause', 'resume', 'stop', 'restart', 'close', 'interrupt'],
      isPauseRequested: false,
      isTakingMessages: true,
      lastActivityAt: expect.toBeValidDate(),
      name: 'Conversation',
      state: expect.toBeString(),
      taskID: 'conversation',
    },
    {
      actions: { cancelled: 0, queued: 0, started: 0 },
      brief: 'Plan the beds.',
      controls: ['pause', 'resume', 'stop', 'restart', 'close', 'interrupt'],
      isPauseRequested: false,
      isTakingMessages: true,
      lastActivityAt: expect.toBeValidDate(),
      name: 'Garden plan',
      state: 'waiting',
      taskID: 'k3x9m2p7qa',
    },
  ]);
});

test('#tasks.list gives the log sequence it read at', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  const [created] = await writeRecords(api.context.log, [
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

  invariant(created);

  const listed = await client.tasks.list({});

  expect(listed.readAtSequence).toBe(created.sequence);
});

test('#tasks.list gives a log sequence before a change that lands after its read of the tasks', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  registerFaultPointAction('task_list.read.after', () =>
    writeRecords(api.context.log, [
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
    ]),
  );

  const listed = await client.tasks.list({});
  const [landed] = await readRecords(api.context.log, { afterSequence: 0, thread: 'k3x9m2p7qa' });

  invariant(landed);

  expect(listed.tasks.map((task) => task.taskID)).toStrictEqual(['conversation']);
  expect(listed.readAtSequence).toBeLessThan(landed.record.sequence);
});

test('#tasks.list names the task that a task with an open question waits on', async () => {
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
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        messageID: 'm7q2x9k4pa',
        from: 'k3x9m2p7qa',
        to: 'conversation',
        kind: 'question',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        opensWait: true,
        source: 'task:k3x9m2p7qa',
      },
      erasable: { body: 'Which bed gets the beans?' },
    },
  ]);

  const listed = await client.tasks.list({});

  expect(
    listed.tasks.map((task) => ({ taskID: task.taskID, waitingOn: task.waitingOn })),
  ).toIncludeSameMembers([
    { taskID: 'conversation', waitingOn: undefined },
    { taskID: 'k3x9m2p7qa', waitingOn: 'conversation' },
  ]);
});

test('#tasks.list counts a cancelled action apart from a queued one', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await api.writer.db
    .$extendTables<ActionsTables>()
    .insertInto('actions')
    .values([
      {
        action_id: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24',
        task_id: 'conversation',
        step_key: 'conversation:1',
        action_hash: 'sha256:send-1',
        tool: 'test.send',
        status: 'pending',
        attempt_count: 0,
        attempt_open: 0,
        next_attempt_at: 0,
        reason: null,
        queued_sequence: 1,
        outcome_sequence: null,
        cancelled_sequence: null,
        updated_sequence: 1,
      },
      {
        action_id: '6e8a0c2d-4f3b-4d7e-9a1c-2b4d6f8a0c3e',
        task_id: 'conversation',
        step_key: 'conversation:1',
        action_hash: 'sha256:archive-1',
        tool: 'test.archive',
        status: 'pending',
        attempt_count: 0,
        attempt_open: 0,
        next_attempt_at: 0,
        reason: null,
        queued_sequence: 1,
        outcome_sequence: null,
        cancelled_sequence: 1,
        updated_sequence: 1,
      },
    ])
    .execute();

  const listed = await client.tasks.list({});

  expect(listed.tasks.find((task) => task.taskID === 'conversation')?.actions).toStrictEqual({
    cancelled: 1,
    queued: 1,
    started: 0,
  });
});

test('#tasks.read gives one task as the list gives it', async () => {
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

  const task = await client.tasks.read({ taskID: 'k3x9m2p7qa' });

  expect(task).toStrictEqual({
    actions: { cancelled: 0, queued: 0, started: 0 },
    brief: 'Plan the beds.',
    controls: ['pause', 'resume', 'stop', 'restart', 'close', 'interrupt'],
    isPauseRequested: false,
    isTakingMessages: true,
    lastActivityAt: expect.toBeValidDate(),
    name: 'Garden plan',
    state: 'waiting',
    taskID: 'k3x9m2p7qa',
  });
});

test('#tasks.read gives a task that the list leaves out past its cap', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await writeRecords(
    api.context.log,
    Array.from({ length: 101 }, (_, index) => ({
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: `garden-${index}`,
      payload: {
        taskID: `garden-${index}`,
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: `Garden bed ${index}`, brief: 'Plan one bed.' },
    })),
  );

  const listed = await client.tasks.list({});
  const oldest = await client.tasks.read({ taskID: 'garden-0' });

  expect(listed.tasks.map((task) => task.taskID)).not.toContain('garden-0');
  expect(oldest.name).toBe('Garden bed 0');
});

test('#tasks.read refuses a task that does not exist', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  const refused = await client.tasks.read({ taskID: 'k3x9m2p7qa' }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({ code: 'TASK_NOT_FOUND' });
});

test('#tasks.read refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const stranger = buildTestClient(api.url);

  await createConversationTask(api.context);

  const refused = await stranger.tasks.read({ taskID: 'conversation' }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#tasks.readActions lists the queued actions a stop would cancel and the started ones apart', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await api.writer.db
    .$extendTables<ActionsTables>()
    .insertInto('actions')
    .values([
      {
        action_id: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24',
        task_id: 'conversation',
        step_key: 'conversation:1',
        action_hash: 'sha256:send-1',
        tool: 'test.send',
        status: 'pending',
        attempt_count: 0,
        attempt_open: 0,
        next_attempt_at: 0,
        reason: null,
        queued_sequence: 1,
        outcome_sequence: null,
        cancelled_sequence: null,
        updated_sequence: 1,
      },
      {
        action_id: '6e8a0c2d-4f3b-4d7e-9a1c-2b4d6f8a0c3e',
        task_id: 'conversation',
        step_key: 'conversation:1',
        action_hash: 'sha256:archive-1',
        tool: 'test.archive',
        status: 'pending',
        attempt_count: 1,
        attempt_open: 0,
        next_attempt_at: 0,
        reason: null,
        queued_sequence: 1,
        outcome_sequence: null,
        cancelled_sequence: null,
        updated_sequence: 1,
      },
    ])
    .execute();

  const actions = await client.tasks.readActions({ taskID: 'conversation' });

  expect(actions).toStrictEqual({
    queued: [{ actionID: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24', tool: 'test.send' }],
    started: [{ actionID: '6e8a0c2d-4f3b-4d7e-9a1c-2b4d6f8a0c3e', tool: 'test.archive' }],
  });
});

test('#tasks.readActions refuses a task that does not exist', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  const refused = await client.tasks.readActions({ taskID: 'k3x9m2p7qa' }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({ code: 'TASK_NOT_FOUND' });
});

test('#tasks.readActions refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const stranger = buildTestClient(api.url);

  expect(stranger.tasks.readActions({ taskID: 'conversation' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
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
