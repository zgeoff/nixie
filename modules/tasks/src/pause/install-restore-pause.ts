import type { LogTables, PendingRestore, TaskToCheck } from '@heynixie/log';
import {
  parseJSONObject,
  pauseNixieInTransaction,
  recoveryStartedCodec,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { isFinishedState } from '@heynixie/task-control';
import type { Transaction } from 'kysely';
import { writeInboxRecordsInTransaction } from '../inbox/write-inbox-records-in-transaction';
import type { TaskState, TasksContext, TasksTables } from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';
import { recoveryNoticeCodec } from './recovery-notice-codec';

export interface RestorePauseOptions {
  readonly pending: PendingRestore | null;

  // One task ID for each action that has no outcome, so an ID repeats once per action.
  readonly readTasksWithPendingActions: (tx: Transaction<unknown>) => Promise<readonly string[]>;
}

export interface RestorePauseInstall {
  readonly recoveryID: string;
  readonly toCheck: number;
  readonly isNew: boolean;
}

export function installRestorePause(
  context: TasksContext,
  options: RestorePauseOptions,
): Promise<RestorePauseInstall | null> {
  const pending = options.pending;

  if (pending === null) {
    return Promise.resolve(null);
  }

  return withWriteTransaction(context.log.writer, async (tx) => {
    const stored = await readStoredToCheck(tx, pending.recoveryID);

    if (stored !== null) {
      return { recoveryID: pending.recoveryID, toCheck: stored, isNew: false };
    }

    const pendingTaskIDs = await options.readTasksWithPendingActions(tx);
    const rows = await readTaskRows(tx, pendingTaskIDs);

    const toCheck = collectTasksToCheck(rows, pendingTaskIDs);

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'recovery.started',
        definitions: context.definitions(),
        payload: recoveryStartedCodec.encode({
          recoveryID: pending.recoveryID,
          restoredAt: pending.restoredAt,
          backupTakenAt: pending.backupTakenAt,
          toCheck,
        }),
      },
    ]);

    await pauseNixieInTransaction(tx, context.log, {
      cause: 'restore',
      recoveryID: pending.recoveryID,
      by: null,
      definitions: context.definitions(),
    });

    // A conversation that is gone or finished reads no inbox, which refuses its input.
    const conversationState = await readConversationState(tx);

    if (conversationState !== null && !isFinishedState(conversationState)) {
      await writeInboxRecordsInTransaction(tx, context, [
        {
          kind: 'recovery.notice',
          definitions: context.definitions(),
          thread: conversationTaskID,
          payload: recoveryNoticeCodec.encode({
            recoveryID: pending.recoveryID,
            restoredAt: pending.restoredAt,
            backupTakenAt: pending.backupTakenAt,
          }),
        },
      ]);
    }

    return { recoveryID: pending.recoveryID, toCheck: toCheck.length, isNew: true };
  });
}

async function readStoredToCheck(
  tx: Transaction<unknown>,
  recoveryID: string,
): Promise<number | null> {
  const db = tx.$extendTables<LogTables>();

  const recovery = await db
    .selectFrom('recoveries')
    .select('started_sequence')
    .where('recovery_id', '=', recoveryID)
    .executeTakeFirst();

  if (recovery === undefined) {
    return null;
  }

  const record = await db
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', recovery.started_sequence)
    .executeTakeFirstOrThrow();

  return recoveryStartedCodec.decode(parseJSONObject(record.payload)).toCheck.length;
}

interface TaskRow {
  readonly taskID: string;
  readonly state: TaskToCheck['stateAtBackup'];
  readonly hasStartedStep: boolean;
}

// A task was running at the backup when its state says so or a step had started and not committed.
async function readTaskRows(
  tx: Transaction<unknown>,
  pendingTaskIDs: readonly string[],
): Promise<readonly TaskRow[]> {
  const rows = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'state', 'started_step_key'])
    .where((builder) =>
      builder.or([
        builder('state', '=', 'running'),
        builder('started_step_key', 'is not', null),
        builder('task_id', 'in', [...new Set(pendingTaskIDs)]),
      ]),
    )
    .execute();

  return rows.map((row) => ({
    taskID: row.task_id,
    state: row.state,
    hasStartedStep: row.started_step_key !== null,
  }));
}

function collectTasksToCheck(
  rows: readonly TaskRow[],
  pendingTaskIDs: readonly string[],
): readonly TaskToCheck[] {
  const pendingCounts = new Map<string, number>();

  for (const taskID of pendingTaskIDs) {
    pendingCounts.set(taskID, (pendingCounts.get(taskID) ?? 0) + 1);
  }

  return rows
    .map((row) => ({
      taskID: row.taskID,
      stateAtBackup: row.state,
      wasRunning: row.hasStartedStep,
      pendingActions: pendingCounts.get(row.taskID) ?? 0,
    }))
    .toSorted((left, right) => left.taskID.localeCompare(right.taskID));
}

async function readConversationState(tx: Transaction<unknown>): Promise<TaskState | null> {
  const conversation = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', conversationTaskID)
    .executeTakeFirst();

  return conversation?.state ?? null;
}
