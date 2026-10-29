import { expect, test } from 'bun:test';
import { removeRecordKey, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { createSystemTask } from './create-system-task';
import { readTaskDirectory } from './read-task-directory';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TaskMessaging } from './types';

function setupTest() {
  return startTestTasks();
}

test('it adds each started task to the directory, with the name and brief it started with', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'memory-writer');

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  const directory = await readTaskDirectory(ctx.context, {
    directory: [
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
  });

  expect(directory).toStrictEqual({
    directory: [
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      {
        taskID: 'k3x9m2p7qa',
        name: 'Garden plan',
        brief: 'Plan the beds.',
        isWokenByMessages: true,
      },
    ],
  });
});

test('it names a started task by its ID once its name is forgotten', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  const created = await ctx.writer.db
    .$extendTables<
      Readonly<{ records: { readonly sequence: number; readonly key_id: string | null } }>
    >()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', 1)
    .executeTakeFirstOrThrow();

  invariant(created.key_id);

  await removeRecordKey(ctx.context.log, created.key_id);

  const directory = await readTaskDirectory<Pick<TaskMessaging, 'directory'>>(ctx.context, {
    directory: [],
  });

  expect(directory.directory).toStrictEqual([
    { taskID: 'k3x9m2p7qa', name: 'Task k3x9m2p7qa', brief: '', isWokenByMessages: true },
  ]);
});
