import type { Log, LogRecord, RecordInput } from './types';
import { withWriteTransaction } from './with-write-transaction';
import { writeRecordsInTransaction } from './write-records-in-transaction';

// The log's append API: it adds records to the end of the log, with every projection row they
// change, in one write transaction of their own.
export function writeRecords(
  log: Log,
  inputs: readonly RecordInput[],
): Promise<readonly LogRecord[]> {
  return withWriteTransaction(log.writer, (tx) => writeRecordsInTransaction(tx, log, inputs));
}
