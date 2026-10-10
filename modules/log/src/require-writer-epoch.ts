import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { StaleWriterError } from './stale-writer-error';

// Throws StaleWriterError unless the stored writer epoch is still this process's. A write
// transaction runs it as its first statement.
export async function requireWriterEpoch(tx: Transaction<unknown>, epoch: number): Promise<void> {
  const result = await sql<{ epoch: number }>`select epoch from writer_epoch where id = 1`.execute(
      tx,
    ),
    [row] = result.rows;

  if (row?.epoch !== epoch) {
    throw new StaleWriterError(epoch, row?.epoch);
  }
}
