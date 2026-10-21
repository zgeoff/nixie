import type { LogRecord, RecordInput } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { TasksContext } from './types';
import { waitAtFaultPoint } from './wait-at-fault-point';
import { writeInboxRecordsInTransaction } from './write-inbox-records-in-transaction';

export async function writeInboxRecords(
  context: Pick<TasksContext, 'log'>,
  inputs: readonly RecordInput[],
): Promise<readonly LogRecord[]> {
  const records = await withWriteTransaction(context.log.writer, (tx) =>
    writeInboxRecordsInTransaction(tx, context, inputs),
  );

  if (NIXIE_TEST_BUILD) {
    for (const record of records) {
      await waitAtFaultPoint('inbox.write.after', { kind: 'task', id: record.thread });
    }
  }

  return records;
}
