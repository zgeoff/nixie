import { expect, onTestFinished, test } from 'bun:test';
import { createConversationTask } from './create-conversation-task';
import { setFaultPointHandler } from './set-fault-point-handler';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { FaultPointContext, FaultPointID, TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';

async function setupTest() {
  const tasks = await startTestTasks();
  const db = tasks.writer.db.$extendTables<TasksTables>();

  await createConversationTask(tasks.context);

  return { ...tasks, db };
}

test('it wakes a waiting task with a message in its inbox', async () => {
  const ctx = await setupTest();

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'what is on today?' },
    },
  ]);

  const task = await ctx.db
    .selectFrom('tasks')
    .select(['state', 'last_inbox_sequence', 'read_cursor'])
    .executeTakeFirstOrThrow();

  expect(task).toStrictEqual({ state: 'ready', last_inbox_sequence: 2, read_cursor: 0 });
});

test('it refuses a record of a kind outside the inbox', async () => {
  const ctx = await setupTest();

  const write = writeInboxRecords(ctx.context, [
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  await write.catch(() => {});

  expect(write).rejects.toThrowWithMessage(Error, 'a turn_finished record is not an inbox record');
});

test('it refuses a record for a task that does not exist', async () => {
  const ctx = await setupTest();

  const write = writeInboxRecords(ctx.context, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'task-404' },
  ]);

  await write.catch(() => {});

  expect(write).rejects.toThrowWithMessage(Error, 'no task has the ID task-404');
});

test('it refuses a record for a task that is done', async () => {
  const ctx = await setupTest();

  await ctx.db.updateTable('tasks').set({ state: 'done' }).execute();

  const write = writeInboxRecords(ctx.context, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  await write.catch(() => {});

  expect(write).rejects.toThrowWithMessage(Error, 'task conversation is done and takes no input');
});

test('it reaches inbox.write.after once the message commits', async () => {
  const ctx = await setupTest();
  const reached: { id: FaultPointID; context: FaultPointContext }[] = [];

  setFaultPointHandler((id, context) => {
    reached.push({ id, context });
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await writeInboxRecords(ctx.context, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  expect(reached).toStrictEqual([
    { id: 'inbox.write.after', context: { kind: 'task', id: 'conversation' } },
  ]);
});
