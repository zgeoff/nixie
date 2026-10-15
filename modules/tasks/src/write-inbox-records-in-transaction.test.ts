import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { createConversationTask } from './create-conversation-task';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeInboxRecordsInTransaction } from './write-inbox-records-in-transaction';

async function setupTest() {
  const tasks = await startTestTasks();

  const db = tasks.writer.db.$extendTables<TasksTables>();

  await createConversationTask(tasks.context);

  return { ...tasks, db };
}

test('it wakes a waiting task once the caller commits its transaction', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    writeInboxRecordsInTransaction(tx, ctx.context, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        erasable: { text: 'what is on today?' },
      },
    ]),
  );

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'last_inbox_sequence'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ state: 'ready', last_inbox_sequence: 2 });
});

test('it writes no message when the caller rolls its transaction back', async () => {
  const ctx = await setupTest();

  const write = withWriteTransaction(ctx.writer, async (tx) => {
    await writeInboxRecordsInTransaction(tx, ctx.context, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
      },
    ]);

    throw new Error('the caller failed after the write');
  });

  await write.catch(() => {});

  const records = await ctx.db.selectFrom('records').select('kind').execute();

  expect(write).rejects.toThrowWithMessage(Error, 'the caller failed after the write');
  expect(records).toStrictEqual([{ kind: 'task.created' }]);
});

test('it refuses a record of a kind outside the inbox', async () => {
  const ctx = await setupTest();

  const write = withWriteTransaction(ctx.writer, (tx) =>
    writeInboxRecordsInTransaction(tx, ctx.context, [
      {
        kind: 'turn_finished',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
      },
    ]),
  );

  await write.catch(() => {});

  expect(write).rejects.toThrowWithMessage(Error, 'a turn_finished record is not an inbox record');
});
