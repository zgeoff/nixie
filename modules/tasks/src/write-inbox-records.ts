import type { LogRecord, RecordInput } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { TasksContext } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';
import { writeInboxRecordsInTransaction } from './write-inbox-records-in-transaction';

// Writes records into tasks' inboxes, such as your messages, in one transaction. Each record must
// be of an inbox kind and name a task that has not ended as its thread. A waiting task becomes
// ready in the same transaction, through the tasks projection.
export async function writeInboxRecords(
  context: Pick<TasksContext, 'log'>,
  inputs: readonly RecordInput[],
): Promise<readonly LogRecord[]> {
  const records = await withWriteTransaction(context.log.writer, (tx) =>
    writeInboxRecordsInTransaction(tx, context, inputs),
  );

  if (NIXIE_TEST_BUILD) {
    for (const record of records) {
      // oxlint-disable-next-line no-await-in-loop -- the harness holds each arrival in turn
      await waitAtFaultPoint('inbox.write.after', { kind: 'task', id: record.thread });
    }
  }

  return records;
}
