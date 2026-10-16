import type { Transaction } from 'kysely';
import { commitEvent } from './commit-event';
import { requireWriterEpoch } from './require-writer-epoch';
import type { Writer } from './types';

// Runs fn in one write transaction that first checks the writer epoch, so a process that lost the
// writer role commits nothing. A StaleWriterError means another process writes now, and this one
// must exit. Once the transaction commits, it fires a commit event on the writer's commit bus.
export async function withWriteTransaction<T>(
  writer: Pick<Writer, 'commits' | 'db' | 'epoch'>,
  fn: (tx: Transaction<unknown>) => Promise<T>,
): Promise<T> {
  const result = await writer.db.transaction().execute(async (tx) => {
    await requireWriterEpoch(tx, writer.epoch);

    return fn(tx);
  });

  writer.commits.dispatchEvent(new Event(commitEvent));

  return result;
}
