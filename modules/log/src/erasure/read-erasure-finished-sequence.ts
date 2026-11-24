import { sql } from 'kysely';
import type { Log, LogTables } from '../types';
import type { ErasableKind } from './erasable-kind';

// The sequence of the record that ended the target's erasure, which the backup state reads, or
// null while the erasure still runs.
export async function readErasureFinishedSequence(
  log: Pick<Log, 'writer'>,
  kind: ErasableKind,
  targetID: string,
): Promise<number | null> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'erasure.finished')
    .where(sql`json_extract(payload, '$.kind')`, '=', kind)
    .where(sql`json_extract(payload, '$.targetID')`, '=', targetID)
    .orderBy('sequence', 'desc')
    .executeTakeFirst();

  return row?.sequence ?? null;
}
