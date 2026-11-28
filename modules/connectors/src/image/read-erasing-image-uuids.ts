import type { Log, LogTables } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';

const chunkSize = 500;
const targetSchema = z.object({ target_id: z.string() });

// The UUIDs among the given ones whose forget has started. A started forget hides its image at
// once, before the keys of its records go, so a forget that stops half way leaves nothing to show.
export async function readErasingImageUUIDs(
  log: Pick<Log, 'writer'>,
  uuids: readonly string[],
): Promise<ReadonlySet<string>> {
  const erasing = new Set<string>();

  for (let start = 0; start < uuids.length; start += chunkSize) {
    const rows = await log.writer.db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select(sql`json_extract(payload, '$.targetID')`.as('target_id'))
      .where('kind', '=', sql.lit('erasure.started'))
      .where(sql`json_extract(payload, '$.kind')`, '=', 'image')
      .where(sql`json_extract(payload, '$.targetID')`, 'in', uuids.slice(start, start + chunkSize))
      .execute();

    for (const row of rows) {
      erasing.add(targetSchema.parse(row).target_id);
    }
  }

  return erasing;
}
