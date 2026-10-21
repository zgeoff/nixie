import type { Log, LogRecord, RecordInput } from './types';
import { withWriteTransaction } from './with-write-transaction';
import { writeRecordsInTransaction } from './write-records-in-transaction';

export function writeRecords(
  log: Log,
  inputs: readonly RecordInput[],
): Promise<readonly LogRecord[]> {
  return withWriteTransaction(log.writer, (tx) => writeRecordsInTransaction(tx, log, inputs));
}
