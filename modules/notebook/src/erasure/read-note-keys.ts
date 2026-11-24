import type { LogTables, WriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import type { NotebookTables } from '../types';

// The key of every version record and of every link record from the note, replaced reasons
// included. A note has no other record that holds its text.
export async function readNoteKeys(tx: WriteTransaction, noteID: string): Promise<string[]> {
  const db = tx.$extendTables<NotebookTables & LogTables>();

  const versionKeys = await db
    .selectFrom('notebook_versions')
    .innerJoin('records', 'records.sequence', 'notebook_versions.seq')
    .select('records.key_id')
    .where('notebook_versions.note_id', '=', noteID)
    .execute();

  const linkKeys = await db
    .selectFrom('records')
    .select('key_id')
    .where('kind', '=', 'notebook.linked')
    .where(sql`json_extract(payload, '$.from')`, '=', noteID)
    .execute();

  return [...versionKeys, ...linkKeys].flatMap((row) => (row.key_id === null ? [] : [row.key_id]));
}
