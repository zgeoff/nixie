import type { LogRecord, RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { isInboxRecord } from './is-inbox-record';
import type { TasksContext, TasksTables } from './types';

// Writes records into tasks' inboxes inside a write transaction that the caller opened with
// withWriteTransaction, so a module's own rows and the messages they describe commit together.
// Each record must be of an inbox kind and name a task that has not ended as its thread.
export async function writeInboxRecordsInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'log'>,
  inputs: readonly RecordInput[],
): Promise<readonly LogRecord[]> {
  for (const input of inputs) {
    // oxlint-disable-next-line no-await-in-loop -- a few records at most, each checked alone
    await requireInboxTarget(tx.$extendTables<TasksTables>(), input);
  }
  return writeRecordsInTransaction(tx, context.log, inputs);
}

async function requireInboxTarget(db: Transaction<TasksTables>, input: RecordInput): Promise<void> {
  if (!isInboxRecord({ kind: input.kind, thread: input.thread ?? null })) {
    throw new Error(`a ${input.kind} record is not an inbox record`);
  }
  await requireTask(db, input.thread ?? '');
}

async function requireTask(db: Transaction<TasksTables>, taskID: string): Promise<void> {
  const row = await db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  if (row === undefined) {
    throw new Error(`no task has the ID ${taskID}`);
  }
  if (row.state === 'done' || row.state === 'failed') {
    throw new Error(`task ${taskID} is ${row.state} and takes no input`);
  }
}
