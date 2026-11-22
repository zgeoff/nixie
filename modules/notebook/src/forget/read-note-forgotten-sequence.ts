import type { Log, LogTables } from '@heynixie/log';
import { sql } from 'kysely';

// The sequence of the record that ended the note's forget, which the backup state reads. Null while
// the cleanup still runs.
export async function readNoteForgottenSequence(
  log: Pick<Log, 'writer'>,
  noteID: string,
): Promise<number | null> {
  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'notebook.note_forgotten')
    .where(sql`json_extract(payload, '$.note')`, '=', noteID)
    .executeTakeFirst();

  return row?.sequence ?? null;
}
