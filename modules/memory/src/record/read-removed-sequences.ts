import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { recordForgetStartedCodec } from './record-forget-started-codec';

const rowSchema = z.object({ record_sequence: z.coerce.number().int() });

// A forget names a record by its own start record, or by the erasure.started of the record kind
// that replaced it. The kinds are literals, not bound values, so that SQLite can prove each lookup
// fits the partial index of the records a forget names.
export async function readRemovedSequences(
  db: Kysely<unknown>,
  sequences: readonly number[],
): Promise<ReadonlySet<number>> {
  if (sequences.length === 0) {
    return new Set();
  }

  const started = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(sql`json_extract(payload, '$.recordSequence')`.as('record_sequence'))
    .where('kind', '=', sql.lit(recordForgetStartedCodec.kind))
    .where(sql`json_extract(payload, '$.recordSequence')`, 'in', sequences)
    .execute();

  const erasures = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(sql`json_extract(payload, '$.targetID')`.as('record_sequence'))
    .where('kind', '=', sql.lit('erasure.started'))
    .where(sql`json_extract(payload, '$.targetID')`, 'in', sequences.map(String))
    .where(sql`json_extract(payload, '$.kind')`, '=', 'record')
    .execute();

  return new Set([...started, ...erasures].map((row) => rowSchema.parse(row).record_sequence));
}
