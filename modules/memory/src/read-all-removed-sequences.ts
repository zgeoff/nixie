import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { recordForgetStartedCodec } from './record-forget-started-codec';

const rowSchema = z.object({ record_sequence: z.int() });

// One read of every sequence that a forget start names, for a reader that replays many records and
// would otherwise look each one up.
export async function readAllRemovedSequences(db: Kysely<unknown>): Promise<ReadonlySet<number>> {
  const rows = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(sql`json_extract(payload, '$.recordSequence')`.as('record_sequence'))
    .where('kind', '=', sql.lit(recordForgetStartedCodec.kind))
    .execute();

  return new Set(rows.map((row) => rowSchema.parse(row).record_sequence));
}
