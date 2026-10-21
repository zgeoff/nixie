import { readQueryRows } from '@heynixie/db';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { StaleWriterError } from './stale-writer-error';

// Throws StaleWriterError unless the stored writer epoch is still this process's. A write
// transaction runs it as its first statement.
export async function requireWriterEpoch(tx: Transaction<unknown>, epoch: number): Promise<void> {
  const [row] = await readQueryRows(
    sql`select epoch from writer_epoch where id = 1`,
    tx,
    z.object({ epoch: z.number() }),
  );

  if (row?.epoch !== epoch) {
    throw new StaleWriterError(epoch, row?.epoch);
  }
}
