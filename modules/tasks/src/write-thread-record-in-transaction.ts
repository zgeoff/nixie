import type { RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { isFinishedState } from '@heynixie/task-control';
import type { Transaction } from 'kysely';
import { isInboxRecord } from './is-inbox-record';
import type { TasksContext, TasksTables } from './types';
import { writeInboxRecordsInTransaction } from './write-inbox-records-in-transaction';

// A task that is still open takes the record as an inbox record, so it hears it. A finished task
// takes no input, so its record is written with no thread and wakes nothing. A thread that is no
// task keeps the record as written.
export async function writeThreadRecordInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'log'>,
  input: RecordInput,
): Promise<void> {
  const thread = input.thread ?? null;

  const task =
    thread === null
      ? undefined
      : await tx
          .$extendTables<TasksTables>()
          .selectFrom('tasks')
          .select('state')
          .where('task_id', '=', thread)
          .executeTakeFirst();

  if (task === undefined) {
    await writeRecordsInTransaction(tx, context.log, [input]);

    return;
  }

  if (isFinishedState(task.state)) {
    const { thread: _thread, ...unthreaded } = input;

    await writeRecordsInTransaction(tx, context.log, [unthreaded]);

    return;
  }

  if (isInboxRecord({ kind: input.kind, thread })) {
    await writeInboxRecordsInTransaction(tx, context, [input]);

    return;
  }

  await writeRecordsInTransaction(tx, context.log, [input]);
}
