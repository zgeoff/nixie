import { expect, test } from 'bun:test';
import type { TaskToCheck } from '@heynixie/log';
import {
  exemptTaskInTransaction,
  pauseNixieInTransaction,
  readPause,
  readRecords,
  recoveryStartedCodec,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { writeStepCommit } from '../step/write-step-commit';
import { readTestTasks } from '../test-utils/read-test-tasks';
import { seedConversationStep } from '../test-utils/seed-conversation-step';
import { seedDoneConversationTask } from '../test-utils/seed-done-conversation-task';
import { seedDoneTask } from '../test-utils/seed-done-task';
import { seedRunningTask } from '../test-utils/seed-running-task';
import { seedStoppedTask } from '../test-utils/seed-stopped-task';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { conversationTaskID } from '../utils/conversation-task-id';
import { probeTaskPaused } from '../utils/probe-task-paused';
import { installRestorePause } from './install-restore-pause';
import { recoveryNoticeCodec } from './recovery-notice-codec';

async function setupTest() {
  const pending = {
    version: 1,
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
  } as const;

  const tasks = await startTestTasks();

  return {
    ...tasks,
    pending,
    install: (pendingTaskIDs: readonly string[]) =>
      installRestorePause(tasks.context, {
        pending,
        readTasksWithPendingActions: () => Promise.resolve(pendingTaskIDs),
      }),
    probeConversationPaused: () =>
      withWriteTransaction(tasks.writer, (tx) => probeTaskPaused(tx, conversationTaskID)),
    readCurrentPause: () => withWriteTransaction(tasks.writer, (tx) => readPause(tx)),
    readPauseRecords: () =>
      readRecords(tasks.context.log, {
        afterSequence: 0,
        kinds: ['recovery.started', 'nixie.paused', 'recovery.notice'],
      }),
  };
}

test('it lists a task with a started step, with its state and that the step had started', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const taskID = await seedRunningTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  await ctx.install([]);

  const [started] = await ctx.readPauseRecords();

  const expected: TaskToCheck[] = [
    { taskID: conversationTaskID, stateAtBackup: 'running', wasRunning: true, pendingActions: 0 },
    { taskID, stateAtBackup: 'running', wasRunning: true, pendingActions: 0 },
  ];

  const stored = recoveryStartedCodec.decode(started?.record.payload ?? {});

  expect(stored.toCheck).toStrictEqual(
    expected.toSorted((left, right) => left.taskID.localeCompare(right.taskID)),
  );
});

test('it lists a done task and a stopped task that own pending actions, with the count of each', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const doneID = await seedDoneTask(ctx.context, {
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const stoppedID = await seedStoppedTask(ctx.context, {
    starter: starter.claim,
    name: 'Moon phases',
    brief: 'Find the moon phases for May.',
  });

  const result = await ctx.install([doneID, doneID, stoppedID, conversationTaskID]);
  const [started] = await ctx.readPauseRecords();

  expect(result).toStrictEqual({ recoveryID: 'recovery-a', toCheck: 3, isNew: true });

  const expected: TaskToCheck[] = [
    { taskID: doneID, stateAtBackup: 'done', wasRunning: false, pendingActions: 2 },
    { taskID: stoppedID, stateAtBackup: 'stopped', wasRunning: false, pendingActions: 1 },
    { taskID: conversationTaskID, stateAtBackup: 'running', wasRunning: true, pendingActions: 1 },
  ];

  const stored = recoveryStartedCodec.decode(started?.record.payload ?? {});

  expect(stored.toCheck).toStrictEqual(
    expected.toSorted((left, right) => left.taskID.localeCompare(right.taskID)),
  );
});

test('it drops an exemption that the backup held and pauses with the cause restore', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await pauseNixieInTransaction(tx, ctx.context.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'owner',
      definitions: ctx.context.definitions(),
    });

    await exemptTaskInTransaction(tx, ctx.context.log, {
      taskID: conversationTaskID,
      by: 'owner',
      definitions: ctx.context.definitions(),
    });
  });

  await ctx.install([]);

  const pause = await ctx.readCurrentPause();
  const isPaused = await ctx.probeConversationPaused();

  expect(pause).toStrictEqual({ cause: 'restore', recoveryID: 'recovery-a' });
  expect(isPaused).toBeTrue();
});

test('it writes the recovery before the pause, in adjacent records', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await ctx.install([]);

  const records = await ctx.readPauseRecords();

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'recovery.started',
    'nixie.paused',
    'recovery.notice',
  ]);

  expect(records[1]?.record.sequence).toBe((records[0]?.record.sequence ?? 0) + 1);
});

test('it writes nothing for a recovery that is already installed, even after a resume', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await ctx.install([]);

  await withWriteTransaction(ctx.writer, (tx) =>
    resumeNixieInTransaction(tx, ctx.context.log, {
      by: 'test',
      definitions: ctx.context.definitions(),
    }),
  );

  const again = await ctx.install([]);
  const records = await ctx.readPauseRecords();

  expect(again).toStrictEqual({ recoveryID: 'recovery-a', toCheck: 1, isNew: false });

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'recovery.started',
    'nixie.paused',
    'recovery.notice',
  ]);

  const pause = await ctx.readCurrentPause();

  expect(pause).toBeNull();
});

test('it returns null and writes nothing when no restore is pending', async () => {
  const ctx = await setupTest();

  const result = await installRestorePause(ctx.context, {
    pending: null,
    readTasksWithPendingActions: () => Promise.resolve([]),
  });

  expect(result).toBeNull();

  const records = await ctx.readPauseRecords();

  expect(records).toStrictEqual([]);
});

test('it writes one notice on the conversation thread with the pending payload', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await ctx.install([]);

  const records = await ctx.readPauseRecords();

  const notices = records.filter((entry) => entry.record.kind === 'recovery.notice');

  expect(notices).toHaveLength(1);
  expect(notices[0]?.record.thread).toBe(conversationTaskID);

  expect(recoveryNoticeCodec.decode(notices[0]?.record.payload ?? {})).toStrictEqual({
    recoveryID: 'recovery-a',
    restoredAt: 2000,
    backupTakenAt: 1000,
  });
});

test('it writes the notice in the same transaction, in the record after the pause', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await ctx.install([]);

  const records = await ctx.readPauseRecords();

  expect(
    records.map((entry) => entry.record.sequence - (records[0]?.record.sequence ?? 0)),
  ).toStrictEqual([0, 1, 2]);
});

test('it leaves the conversation waiting, with its inbox cursor unmoved, when the notice lands', async () => {
  const ctx = await setupTest();
  const step = await seedConversationStep(ctx.context);

  await writeStepCommit(ctx.context, step.claim, {
    next: 'wait',
    records: [],
    acknowledged: [step.messageSequence],
  });

  const [before] = await readTestTasks(ctx.writer);

  await ctx.install([]);

  const [after] = await readTestTasks(ctx.writer);

  expect(before?.state).toBe('waiting');
  expect(after).toStrictEqual(before);
});

test('it writes no second notice for a recovery that is already installed', async () => {
  const ctx = await setupTest();

  await seedConversationStep(ctx.context);

  await ctx.install([]);
  await ctx.install([]);

  const records = await ctx.readPauseRecords();

  expect(records.filter((entry) => entry.record.kind === 'recovery.notice')).toHaveLength(1);
});

test('it writes no notice and still pauses when the conversation does not exist', async () => {
  const ctx = await setupTest();
  const result = await ctx.install([]);
  const records = await ctx.readPauseRecords();
  const pause = await ctx.readCurrentPause();

  expect(result?.isNew).toBeTrue();

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'recovery.started',
    'nixie.paused',
  ]);

  expect(pause).toStrictEqual({ cause: 'restore', recoveryID: 'recovery-a' });
});

test('it writes no notice and still pauses when the conversation is finished', async () => {
  const ctx = await setupTest();

  await seedDoneConversationTask(ctx.context);

  await ctx.install([]);

  const records = await ctx.readPauseRecords();
  const pause = await ctx.readCurrentPause();

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'recovery.started',
    'nixie.paused',
  ]);

  expect(pause).toStrictEqual({ cause: 'restore', recoveryID: 'recovery-a' });
});
