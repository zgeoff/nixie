import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { MomentRow } from './read-moment-row';

// A link adds a row beside the moment's text, edges and state, so a link committed since the
// version the caller read never clobbers the caller's change. Only an edit or a retirement does.
export async function probeMomentMovedOn(
  tx: Transaction<unknown>,
  row: MomentRow,
  readVersion: number,
): Promise<boolean> {
  if (row.version === readVersion) {
    return false;
  }

  if (row.version < readVersion) {
    return true;
  }

  const result = await sql`select 1 as moved from records
    where kind in ('moment_edited', 'moment_retired')
      and json_extract(payload, '$.momentID') = ${row.moment_id}
      and json_extract(payload, '$.version') > ${readVersion}
    limit 1`.execute(tx);

  return result.rows.length > 0;
}
