import type { Transaction } from 'kysely';
import { readPause } from './read-pause';
import { taskExemptedCodec } from './task-exempted-codec';
import type { Definitions, LogTables, PauseLog } from './types';
import { writeRecordsInTransaction } from './write-records-in-transaction';

export interface ExemptTaskRequest {
  readonly taskID: string;
  readonly by: string;
  readonly definitions: Definitions;
}

export async function exemptTaskInTransaction(
  tx: Transaction<unknown>,
  log: PauseLog,
  request: ExemptTaskRequest,
): Promise<void> {
  const pause = await readPause(tx);

  if (pause === null) {
    throw new Error(`task ${request.taskID} cannot be exempt: nixie is not paused`);
  }

  const exempt = await tx
    .$extendTables<LogTables>()
    .selectFrom('pause_exemptions')
    .select('task_id')
    .where('task_id', '=', request.taskID)
    .executeTakeFirst();

  if (exempt !== undefined) {
    return;
  }

  await writeRecordsInTransaction(tx, log, [
    {
      kind: 'nixie.task_exempted',
      definitions: request.definitions,
      payload: taskExemptedCodec.encode({ taskID: request.taskID, by: request.by }),
    },
  ]);
}
