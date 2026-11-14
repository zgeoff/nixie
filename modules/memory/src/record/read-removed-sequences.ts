import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { recordForgetStartedCodec } from './record-forget-started-codec';

const rowSchema = z.object({ record_sequence: z.int() });

// The kind is a literal, not a bound value, so that SQLite can prove the lookup fits the partial
// index of records a forget names.
export async function readRemovedSequences(
  db: Kysely<unknown>,
  sequences: readonly number[],
): Promise<ReadonlySet<number>> {
  if (sequences.length === 0) {
    return new Set();
  }

  const rows = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(sql`json_extract(payload, '$.recordSequence')`.as('record_sequence'))
    .where('kind', '=', sql.lit(recordForgetStartedCodec.kind))
    .where(sql`json_extract(payload, '$.recordSequence')`, 'in', sequences)
    .execute();

  return new Set(rows.map((row) => rowSchema.parse(row).record_sequence));
}
