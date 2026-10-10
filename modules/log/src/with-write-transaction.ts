import type { Transaction } from 'kysely';
import { requireWriterEpoch } from './require-writer-epoch';
import type { Writer } from './types';

// Runs fn in one write transaction that first checks the writer epoch, so a process that lost the
// writer role commits nothing. A StaleWriterError means another process writes now, and this one
// must exit.
export function withWriteTransaction<T>(
  writer: Pick<Writer, 'db' | 'epoch'>,
  fn: (tx: Transaction<unknown>) => Promise<T>,
): Promise<T> {
  return writer.db.transaction().execute(async (tx) => {
    await requireWriterEpoch(tx, writer.epoch);
    return fn(tx);
  });
}
