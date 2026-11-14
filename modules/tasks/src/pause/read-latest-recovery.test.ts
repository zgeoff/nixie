import { expect, test } from 'bun:test';
import { resumeNixieInTransaction, withWriteTransaction } from '@heynixie/log';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { conversationTaskID } from '../utils/conversation-task-id';
import { installRestorePause } from './install-restore-pause';
import { readLatestRecovery } from './read-latest-recovery';

async function setupTest() {
  const tasks = await startTestTasks();

  return {
    ...tasks,
    install: (recoveryID: string, restoredAt: number) =>
      installRestorePause(tasks.context, {
        pending: { version: 1, recoveryID, restoredAt, backupTakenAt: restoredAt - 1000 },
        readTasksWithPendingActions: () => Promise.resolve([]),
      }),
    readLatest: () => withWriteTransaction(tasks.writer, (tx) => readLatestRecovery(tx)),
  };
}

test('it returns null before any restore', async () => {
  const ctx = await setupTest();
  const recovery = await ctx.readLatest();

  expect(recovery).toBeNull();
});

test('it returns the recovery and its tasks to check after an install', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await ctx.install('recovery-a', 2000);

  const recovery = await ctx.readLatest();

  expect(recovery).toStrictEqual({
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
    toCheck: [
      { taskID: conversationTaskID, stateAtBackup: 'running', wasRunning: true, pendingActions: 0 },
    ],
  });
});

test('it returns the same recovery after the resume', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await ctx.install('recovery-a', 2000);

  await withWriteTransaction(ctx.writer, (tx) =>
    resumeNixieInTransaction(tx, ctx.context.log, {
      by: 'test',
      definitions: ctx.context.definitions(),
    }),
  );

  const recovery = await ctx.readLatest();

  expect(recovery?.recoveryID).toBe('recovery-a');
  expect(recovery?.toCheck).toHaveLength(1);
});

test('it returns the later of two recoveries', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await ctx.install('recovery-a', 2000);
  await ctx.install('recovery-b', 5000);

  const recovery = await ctx.readLatest();

  expect(recovery?.recoveryID).toBe('recovery-b');
  expect(recovery?.restoredAt).toBe(5000);
});
