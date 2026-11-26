import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { seedClosedTask } from '../test-utils/seed-closed-task';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedTask } from '../test-utils/seed-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readInbox } from './read-inbox';
import { readSettlementTarget } from './read-settlement-target';
import { writeThreadRecordInTransaction } from './write-thread-record-in-transaction';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    readTarget: (thread: string) =>
      withWriteTransaction(tasks.writer, (tx) => readSettlementTarget(tx, thread)),
  };
}

test('it keeps the settlement of an open task on its own thread', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tidy the notes',
    brief: 'Tidy them.',
  });

  const target = await ctx.readTarget(taskID);

  expect(target).toStrictEqual({ thread: taskID, task: null });
});

test('it sends the settlement of a closed started task to its starter, with its ID', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedClosedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tidy the notes',
    brief: 'Tidy them.',
  });

  const target = await ctx.readTarget(taskID);

  expect(target).toStrictEqual({ thread: 'conversation', task: taskID });
});

test('it keeps each of two settlements for an open task as its own inbox record before the task wakes', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedTask(ctx.context, {
    starter: starter.claim,
    name: 'Tidy the notes',
    brief: 'Tidy them.',
  });

  await withWriteTransaction(ctx.writer, async (tx) => {
    for (const shortID of ['k3x9m2p7qa', 'w7tn4c9rhz']) {
      await writeThreadRecordInTransaction(tx, ctx.context, {
        kind: 'proposals.settled',
        definitions: ctx.context.definitions(),
        thread: taskID,
        payload: {
          proposalID: shortID,
          shortID,
          family: 'skill',
          outcome: 'approved',
          answeredBy: 'owner',
          usedBy: null,
          detail: null,
          task: null,
          replaced: null,
          byProposer: false,
        },
      });
    }
  });

  const inbox = await readInbox(ctx.context, taskID);

  expect(inbox.map((record) => record.kind)).toStrictEqual([
    'task_message',
    'proposals.settled',
    'proposals.settled',
  ]);
});
