import type { Log, LogTables } from '@heynixie/log';
import { sql } from 'kysely';
import { readTextFields } from './read-text-fields';
import type { StoredTextFields } from './read-text-fields';
import { readTextRow } from './read-text-row';

// The sender and body that nixie holds for a text, or null when the text is unknown, its forget has
// begun, or its fields are gone. The core reads it in the transaction that writes a wake, so a wake
// never holds a copy that a forget started after the source read the text.
export async function readStoredText(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  shortID: string,
): Promise<StoredTextFields | null> {
  const row = await readTextRow(log, shortID);

  if (row === null) {
    return null;
  }

  const forget = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', 'erasure.started')
    .where(sql`json_extract(payload, '$.targetID')`, '=', row.text_id)
    .executeTakeFirst();

  if (forget !== undefined) {
    return null;
  }

  const fields = await readTextFields(log, [row]);

  return fields.get(row.record_sequence) ?? null;
}
