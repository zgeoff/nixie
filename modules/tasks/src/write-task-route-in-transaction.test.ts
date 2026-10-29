import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createConversationTask } from './create-conversation-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeInboxRecords } from './write-inbox-records';
import { writeTaskRouteInTransaction } from './write-task-route-in-transaction';

test('it routes the unread messages of the conversation when the route names none', async () => {
  const ctx = await startTestTasks();

  await createConversationTask(ctx.context);

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'Plan the bean rows.' },
    },
  ]);

  invariant(message);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeTaskRouteInTransaction(tx, ctx.context, {
      taskID: 'k3x9m2p7qa',
      via: 'start',
      messageID: null,
      onBehalfOf: [],
    }),
  );

  const routed = await readRecords(ctx.context.log, { afterSequence: 0, kinds: ['task.routed'] });

  expect(routed.map((entry) => [entry.record.thread, entry.record.payload])).toStrictEqual([
    [
      'conversation',
      { taskID: 'k3x9m2p7qa', via: 'start', messageID: null, messages: [message.sequence] },
    ],
  ]);
});

test('it routes a message from another task on that task thread too, so its page shows the route', async () => {
  const ctx = await startTestTasks();

  await createConversationTask(ctx.context);

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

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'w8d2n5rt1c',
      contentSource: 'owner',
      erasable: { text: 'Plan the bean rows.' },
    },
  ]);

  invariant(message);

  await withWriteTransaction(ctx.writer, (tx) =>
    writeTaskRouteInTransaction(tx, ctx.context, {
      taskID: 'k3x9m2p7qa',
      via: 'message',
      messageID: '#40',
      onBehalfOf: [String(message.sequence)],
    }),
  );

  const routed = await readRecords(ctx.context.log, { afterSequence: 0, kinds: ['task.routed'] });

  const payload = {
    taskID: 'k3x9m2p7qa',
    via: 'message',
    messageID: '#40',
    messages: [message.sequence],
  };

  expect(routed.map((entry) => [entry.record.thread, entry.record.payload])).toStrictEqual([
    ['conversation', payload],
    ['w8d2n5rt1c', payload],
  ]);
});
