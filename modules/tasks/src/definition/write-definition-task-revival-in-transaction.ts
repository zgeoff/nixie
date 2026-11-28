import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { TasksContext } from '../types';
import { taskRevivedCodec } from '../utils/task-revived-codec';

// Moves a failed definition's task back to ready with no step errors, in the transaction that
// delivers the fire which revives it.
export async function writeDefinitionTaskRevivalInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  taskID: string,
): Promise<void> {
  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: taskRevivedCodec.kind,
      definitions: context.definitions(),
      thread: taskID,
      payload: taskRevivedCodec.encode({ taskID }),
    },
  ]);
}
