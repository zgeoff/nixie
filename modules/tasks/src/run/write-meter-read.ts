import { withWriteTransaction } from '@heynixie/log';
import type { TasksContext } from '../types';
import type { TaskMeterReadReason } from './task-meter-read-codec';
import { writeMeterReadInTransaction } from './write-meter-read-in-transaction';

export interface MeterReadWrite {
  readonly taskID: string;
  readonly taskRunID: string;
  readonly sandbox: string;
  readonly reason: TaskMeterReadReason;
  readonly countMicros: number;
}

// The count was read whoever holds the task's lease now, so the write checks no lease: a step that
// lost its lease still counts what its turn spent. The spend ledger's row of the task run is set in
// the transaction that writes the record.
export function writeMeterRead(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  read: MeterReadWrite,
): Promise<void> {
  return withWriteTransaction(context.log.writer, (tx) =>
    writeMeterReadInTransaction(tx, context, read),
  );
}
