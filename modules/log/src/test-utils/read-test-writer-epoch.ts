import { readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Writer } from '../types';

export async function readTestWriterEpoch(writer: Pick<Writer, 'db'>): Promise<number | null> {
  const [row] = await readQueryRows(
    sql`select epoch from writer_epoch where id = 1`,
    writer.db,
    z.object({ epoch: z.number() }),
  );

  return row?.epoch ?? null;
}
