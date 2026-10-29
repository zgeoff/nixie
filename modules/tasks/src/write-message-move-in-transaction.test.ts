import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createConversationTask } from './create-conversation-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeMessageMoveInTransaction } from './write-message-move-in-transaction';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it moves a misrouted message: a correction record, a notice to the task that lost it, and the message to the task that gains it', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

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

  const outcome = await withWriteTransaction(ctx.writer, (tx) =>
    writeMessageMoveInTransaction(tx, ctx.context, {
      message: message.sequence,
      thread: 'conversation',
      to: { kind: 'task', taskID: 'w8d2n5rt1c' },
    }),
  );

  const written = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.route_corrected', 'task.message_moved'],
  });

  const route = await ctx.db
    .selectFrom('message_routes')
    .select(['message_sequence', 'task_id'])
    .execute();

  const tasks = await ctx.db
    .selectFrom('tasks')
    .select(['task_id', 'state'])
    .where('task_id', 'in', ['k3x9m2p7qa', 'w8d2n5rt1c'])
    .orderBy('task_id')
    .execute();

  const moved = {
    message: message.sequence,
    messageThread: 'conversation',
    from: 'k3x9m2p7qa',
    to: 'w8d2n5rt1c',
  };

  expect(outcome).toStrictEqual({ status: 'moved', taskID: 'w8d2n5rt1c' });

  expect(written.map((entry) => entry.record)).toMatchObject([
    {
      kind: 'task.route_corrected',
      thread: 'conversation',
      payload: { message: message.sequence, from: 'k3x9m2p7qa', to: 'w8d2n5rt1c' },
    },
    { kind: 'task.message_moved', thread: 'k3x9m2p7qa', payload: moved },
    { kind: 'task.message_moved', thread: 'w8d2n5rt1c', payload: moved },
  ]);

  expect(route).toStrictEqual([{ message_sequence: message.sequence, task_id: 'w8d2n5rt1c' }]);

  expect(tasks).toStrictEqual([
    { task_id: 'k3x9m2p7qa', state: 'waiting' },
    { task_id: 'w8d2n5rt1c', state: 'ready' },
  ]);
});

test('it writes nothing of a move when the transaction around it fails', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

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
      thread: 'w8d2n5rt1c',
      payload: {
        taskID: 'w8d2n5rt1c',
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: 'Weekend trip', brief: 'Plan the weekend away.' },
    },
  ]);

  const failed = await withWriteTransaction(ctx.writer, async (tx) => {
    await writeMessageMoveInTransaction(tx, ctx.context, {
      message: message.sequence,
      thread: 'conversation',
      to: { kind: 'task', taskID: 'w8d2n5rt1c' },
    });

    throw new Error('the client action did not write');
  }).then(
    () => null,
    (error: unknown) => error,
  );

  const written = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.route_corrected', 'task.message_moved'],
  });

  const target = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', 'w8d2n5rt1c')
    .executeTakeFirstOrThrow();

  expect(failed).toBeInstanceOf(Error);
  expect(written).toStrictEqual([]);
  expect(target.state).toBe('waiting');
});

test('it moves a message the conversation kept to a new task, with the name and brief the owner gives', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Find a plumber for the leak.' },
    },
  ]);

  invariant(message);

  const outcome = await withWriteTransaction(ctx.writer, (tx) =>
    writeMessageMoveInTransaction(tx, ctx.context, {
      message: message.sequence,
      thread: 'conversation',
      to: { kind: 'new', name: 'Plumber', brief: 'Find a plumber who can come this week.' },
    }),
  );

  invariant(outcome.status === 'moved');

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'started_by'])
    .where('task_id', '=', outcome.taskID)
    .executeTakeFirstOrThrow();

  const written = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['task.created', 'task.route_corrected', 'task.message_moved'],
  });

  expect(task).toStrictEqual({ state: 'ready', started_by: 'owner' });

  expect(written.map((entry) => entry.record).slice(1)).toMatchObject([
    {
      kind: 'task.created',
      thread: outcome.taskID,
      erasable: {
        status: 'readable',
        fields: { name: 'Plumber', brief: 'Find a plumber who can come this week.' },
      },
    },
    {
      kind: 'task.route_corrected',
      payload: { message: message.sequence, from: 'conversation', to: outcome.taskID },
    },
    { kind: 'task.message_moved', thread: 'conversation' },
    { kind: 'task.message_moved', thread: outcome.taskID },
  ]);
});

test('it refuses to move a message to the task it already went to', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Find a plumber for the leak.' },
    },
  ]);

  invariant(message);

  const outcome = await withWriteTransaction(ctx.writer, (tx) =>
    writeMessageMoveInTransaction(tx, ctx.context, {
      message: message.sequence,
      thread: 'conversation',
      to: { kind: 'task', taskID: 'conversation' },
    }),
  );

  expect(outcome).toStrictEqual({ status: 'refused', refusal: { reason: 'same_task' } });
});

test('it refuses to move a record that is no message of the owner on that thread', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const outcome = await withWriteTransaction(ctx.writer, (tx) =>
    writeMessageMoveInTransaction(tx, ctx.context, {
      message: 1,
      thread: 'conversation',
      to: { kind: 'new', name: 'Plumber', brief: 'Find a plumber.' },
    }),
  );

  expect(outcome).toStrictEqual({ status: 'refused', refusal: { reason: 'not_found' } });
});
