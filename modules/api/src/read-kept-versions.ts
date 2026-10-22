import { sql } from 'kysely';
import { z } from 'zod';
import type { APIContext, APITables } from './types';

const keptSchema = z.object({ itemID: z.string(), version: z.int() });

export async function readKeptVersions(
  context: APIContext,
  itemIDs: readonly string[],
): Promise<ReadonlySet<string>> {
  if (itemIDs.length === 0) {
    return new Set();
  }

  const rows = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select('result')
    .where('procedure', '=', 'memory.keep')
    .where(sql`json_extract(result, '$.itemID')`, 'in', itemIDs)
    .execute();

  return new Set(
    rows.map((row) => {
      const kept = keptSchema.parse(JSON.parse(row.result));

      return `${kept.itemID}/${String(kept.version)}`;
    }),
  );
}
