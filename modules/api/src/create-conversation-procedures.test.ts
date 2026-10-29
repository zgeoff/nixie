import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const laptop = await createDeviceSession(api.context, 'laptop');

  return { ...api, client: buildTestClient(api.url, laptop.token) };
}

test('#conversation.move moves a misrouted message to the task you name, with its correction and both inboxes', async () => {
  const ctx = await setupTest();

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Book the ferry for Saturday.' },
    },
  ]);

  invariant(message);

  await writeRecords(ctx.context.log, [
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
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'w8d2n5rt1c',
      payload: {
        taskID: 'w8d2n5rt1c',
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: 'Weekend trip', brief: 'Plan the weekend away.' },
    },
    {
      kind: 'task.routed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        taskID: 'k3x9m2p7qa',
        via: 'start',
        messageID: null,
        messages: [message.sequence],
      },
    },
  ]);

  const moved = await ctx.client.conversation.move({
    clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
    sequence: message.sequence,
    thread: 'conversation',
    to: { kind: 'task', taskID: 'w8d2n5rt1c' },
  });

  const written = await readRecords(ctx.context.log, {
    afterSequence: message.sequence,
    kinds: ['task.route_corrected', 'task.message_moved'],
  });

  const page = await ctx.client.conversation.read({ thread: 'conversation' });

  expect(moved).toStrictEqual({ movedAt: expect.toBeValidDate(), taskID: 'w8d2n5rt1c' });

  expect(written.map((entry) => [entry.record.kind, entry.record.thread])).toStrictEqual([
    ['task.route_corrected', 'conversation'],
    ['task.message_moved', 'k3x9m2p7qa'],
    ['task.message_moved', 'w8d2n5rt1c'],
  ]);

  expect(page.records.at(-1)?.route).toStrictEqual({
    isMove: true,
    messages: [message.sequence],
    taskID: 'w8d2n5rt1c',
  });
});

test('#conversation.move moves a message to a new task with the name and brief you give', async () => {
  const ctx = await setupTest();

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Find a plumber for the outside tap.' },
    },
  ]);

  invariant(message);

  const moved = await ctx.client.conversation.move({
    clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
    sequence: message.sequence,
    thread: 'conversation',
    to: { kind: 'new', name: 'Plumber', brief: 'Books a plumber for the outside tap.' },
  });

  const listed = await ctx.client.tasks.list({});

  expect(listed.tasks.find((task) => task.taskID === moved.taskID)).toStrictEqual({
    brief: 'Books a plumber for the outside tap.',
    lastActivityAt: expect.toBeValidDate(),
    name: 'Plumber',
    state: 'ready',
    taskID: moved.taskID,
  });
});

test('#conversation.move answers a repeat of the same action with the first result, and moves once', async () => {
  const ctx = await setupTest();

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Find a plumber for the outside tap.' },
    },
  ]);

  invariant(message);

  const input = {
    clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
    sequence: message.sequence,
    thread: 'conversation',
    to: { kind: 'new', name: 'Plumber', brief: 'Books a plumber.' },
  } as const;

  const first = await ctx.client.conversation.move(input);
  const again = await ctx.client.conversation.move(input);

  const written = await readRecords(ctx.context.log, {
    afterSequence: message.sequence,
    kinds: ['task.route_corrected'],
  });

  expect(again).toStrictEqual(first);
  expect(written).toHaveLength(1);
});

test('#conversation.move refuses a message the thread does not hold as not found', async () => {
  const ctx = await setupTest();

  // Bun's synchronous rejects matcher blocks the event loop, and the move's write waits on the
  // database worker thread, so the test settles the call before it asserts.
  const refused = await ctx.client.conversation
    .move({
      clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
      sequence: 404,
      thread: 'conversation',
      to: { kind: 'new', name: 'Plumber', brief: 'Books a plumber.' },
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({ code: 'RECORD_NOT_FOUND' });
});

test('#conversation.move refuses a task that does not exist', async () => {
  const ctx = await setupTest();

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Book the ferry for Saturday.' },
    },
  ]);

  invariant(message);

  const refused = await ctx.client.conversation
    .move({
      clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
      sequence: message.sequence,
      thread: 'conversation',
      to: { kind: 'task', taskID: 'z0z0z0z0z0' },
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({ code: 'TASK_NOT_FOUND' });
});

test('#conversation.move refuses a move to the task that already holds the message', async () => {
  const ctx = await setupTest();

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Book the ferry for Saturday.' },
    },
  ]);

  invariant(message);

  const refused = await ctx.client.conversation
    .move({
      clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
      sequence: message.sequence,
      thread: 'conversation',
      to: { kind: 'task', taskID: 'conversation' },
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  expect(refused).toMatchObject({ code: 'ALREADY_THERE' });
});

test('#conversation.move refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const stranger = buildTestClient(ctx.url);

  expect(
    stranger.conversation.move({
      clientActionID: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
      sequence: 1,
      thread: 'conversation',
      to: { kind: 'new', name: 'Plumber', brief: 'Books a plumber.' },
    }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
