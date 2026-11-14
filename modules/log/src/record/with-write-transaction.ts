import type { Transaction } from 'kysely';
import type { Writer } from '../types';
import { requireWriterEpoch } from '../writer/require-writer-epoch';
import { commitEvent } from './commit-event';

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
