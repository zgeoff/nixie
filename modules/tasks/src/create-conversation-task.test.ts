import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { createConversationTask } from './create-conversation-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';

function setupTest() {
  return startTestTasks();
}

test('it creates the conversation as a waiting task flagged as the conversation', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const task = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'is_conversation', 'state'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ task_id: 'conversation', is_conversation: 1, state: 'waiting' });
});

test('it leaves the conversation be on every start after the first', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);
  await createConversationTask(ctx.context);

  const records = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select('kind')
    .execute();

  expect(records).toStrictEqual([{ kind: 'task.created' }]);
});

test('it makes ready a conversation that an earlier release let fail, with its errors cleared', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  // an earlier release failed the conversation at its error limit
  await withWriteTransaction(ctx.writer, (tx) =>
    writeRecordsInTransaction(tx, ctx.context.log, [
      {
        kind: 'task.step_errored',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: {
          taskID: 'conversation',
          stepKey: 'conversation:1',
          nextState: 'failed',
          errors: 3,
          claimableAt: 1_030_000,
        },
        erasable: { message: 'the provider is overloaded' },
      },
    ]),
  );

  await createConversationTask(ctx.context);

  const task = await ctx.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['state', 'step_errors', 'claimable_at'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ state: 'ready', step_errors: 0, claimable_at: 0 });
});
