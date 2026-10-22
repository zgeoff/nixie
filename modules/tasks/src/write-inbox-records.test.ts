import { expect, onTestFinished, test } from 'bun:test';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { setFaultPointHandler } from './set-fault-point-handler';
import { createTestClaim } from './test-utils/create-test-claim';
import { createTestConversationClaim } from './test-utils/create-test-conversation-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { FaultPointContext, FaultPointID, TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepError } from './write-step-error';

async function setupTest() {
  const tasks = await startTestTasks();

  const db = tasks.writer.db.$extendTables<TasksTables>();

  return { ...tasks, db };
}

test('it wakes a waiting task with a message in its inbox', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

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

test("it ends the conversation's retry backoff with a new message", async () => {
  const ctx = await setupTest();
  const claim = await createTestConversationClaim(ctx.context, 'what is on today?');

  await writeStepError(ctx.context, claim, {
    error: new Error('the provider is overloaded'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'are you there?' },
    },
  ]);

  const next = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(next?.stepKey).toBe('conversation:1');
});

test("it keeps another task's retry delay when a record lands in its inbox", async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepError(ctx.context, claim, {
    error: new Error('the provider is overloaded'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
    },
  ]);

  const next = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  expect(next).toBeNull();
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

  await createConversationTask(ctx.context);

  await ctx.db.updateTable('tasks').set({ state: 'done' }).execute();

  const write = writeInboxRecords(ctx.context, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, thread: 'conversation' },
  ]);

  await write.catch(() => {});

  expect(write).rejects.toThrowWithMessage(Error, 'task conversation is done and takes no input');
});

test('it reaches inbox.write.after once the message commits', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

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
