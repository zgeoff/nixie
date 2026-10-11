import type { LogRecord, RecordInput } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { isInboxRecord } from './is-inbox-record';
import type { TasksContext, TasksTables } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';

// Writes records into tasks' inboxes, such as your messages, in one transaction. Each record must
// be of an inbox kind and name an existing task as its thread. A waiting task becomes ready in the
// same transaction, through the tasks projection.
export async function writeInboxRecords(
  context: Pick<TasksContext, 'log'>,
  inputs: readonly RecordInput[],
): Promise<readonly LogRecord[]> {
  const records = await withWriteTransaction(context.log.writer, async (tx) => {
    for (const input of inputs) {
      // oxlint-disable-next-line no-await-in-loop -- a few records at most, each checked alone
      await requireInboxTarget(tx.$extendTables<TasksTables>(), input);
    }
    return writeRecordsInTransaction(tx, context.log, inputs);
  });

  if (NIXIE_TEST_BUILD) {
    for (const record of records) {
      // oxlint-disable-next-line no-await-in-loop -- the harness holds each arrival in turn
      await waitAtFaultPoint('inbox.write.after', { kind: 'task', id: record.thread });
    }
  }
  return records;
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
    .select('task_id')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  if (row === undefined) {
    throw new Error(`no task has the ID ${taskID}`);
  }
}
