import { expect, test } from 'bun:test';
import { removeRecordKey } from '@heynixie/log';
import { createConversationTask, readInbox, writeInboxRecords } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { readCurrentInbox } from './read-current-inbox';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  // boot data: an inbox record needs the task its thread names
  await createConversationTask(tasks.context);

  return tasks;
}

test('it reads a message whose key a forget deleted after the first read as forgotten', async () => {
  const ctx = await setupTest();

  const [message] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The shed code is 4417.' },
    },
  ]);

  invariant(message);

  const read = await readInbox(ctx.context, 'conversation');

  const row = await ctx.writer.db
    .$extendTables<{ records: { sequence: number; key_id: string | null } }>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', message.sequence)
    .executeTakeFirstOrThrow();

  invariant(row.key_id !== null);

  await removeRecordKey(ctx.context.log, row.key_id);

  const current = await readCurrentInbox(ctx.context, read);

  expect(read.map((record) => record.erasable.status)).toStrictEqual(['readable']);
  expect(current.map((record) => record.erasable)).toStrictEqual([{ status: 'shredded' }]);
});

test('it reads every record still readable as it was, in order', async () => {
  const ctx = await setupTest();

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The shed code is 4417.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'And the gate code is 9902.' },
    },
  ]);

  const read = await readInbox(ctx.context, 'conversation');
  const current = await readCurrentInbox(ctx.context, read);

  expect(current).toStrictEqual(read);
});
