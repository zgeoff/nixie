import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { TasksContext } from '../types';
import { taskMeterReadCodec } from './task-meter-read-codec';
import type { MeterReadWrite } from './write-meter-read';

// The read and the ledger row that follows it commit with the caller's transaction.
export async function writeMeterReadInTransaction(
  tx: Transaction<unknown>,
  context: Pick<TasksContext, 'definitions' | 'log'>,
  read: MeterReadWrite,
): Promise<void> {
  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: taskMeterReadCodec.kind,
      definitions: context.definitions(),
      thread: read.taskID,
      payload: taskMeterReadCodec.encode({
        taskRunID: read.taskRunID,
        sandbox: read.sandbox,
        reason: read.reason,
        countMicros: read.countMicros,
      }),
    },
  ]);
}
