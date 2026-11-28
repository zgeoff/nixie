import { sql } from 'kysely';
import { parseJSONObject } from '../record/parse-json-object';
import type { Log, LogTables } from '../types';
import { erasureStartedCodec } from './erasure-started-codec';

// The parent of each erasure, by erasure ID. A root erasure, which a caller begins itself, has a
// null parent, and an ID with no start record is left out.
export async function readErasureParentIDs(
  log: Pick<Log, 'writer'>,
  erasureIDs: readonly string[],
): Promise<ReadonlyMap<string, string | null>> {
  if (erasureIDs.length === 0) {
    return new Map();
  }

  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', sql.lit('erasure.started'))
    .where(sql`json_extract(payload, '$.erasureID')`, 'in', [...erasureIDs])
    .execute();

  return new Map(
    rows.map((row) => {
      const started = erasureStartedCodec.decode(parseJSONObject(row.payload));

      return [started.erasureID, started.parentID] as const;
    }),
  );
}
