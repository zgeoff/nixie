import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// The key of each image offer that names the message as its source. An earlier release sealed an
// offer's image under its own key, so the message's forget removes those keys with its own.
export async function readImageOfferKeyIDs(
  db: Kysely<unknown>,
  messageSequence: number,
): Promise<readonly string[]> {
  const rows = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('kind', '=', 'memory.image_offered')
    .where(sql`json_extract(payload, '$.messageSequence')`, '=', messageSequence)
    .where('key_id', 'is not', null)
    .execute();

  return rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id]));
}
