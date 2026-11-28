import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { ImageTables } from './image-tables';

// An import keeps its own bytes under its own record's key, so a forget of the record it came from
// removes those keys too, and the imported image reads as forgotten with it.
export async function readImportedImageKeyIDs(
  db: Kysely<unknown>,
  sourceSequence: number,
): Promise<readonly string[]> {
  const rows = await db
    .$extendTables<ImageTables & LogTables>()
    .selectFrom('images')
    .innerJoin('records', 'records.sequence', 'images.sequence')
    .select('records.key_id')
    .where('images.source_seq', '=', sourceSequence)
    .where('images.source', 'in', ['file', 'photo'])
    .execute();

  return rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id]));
}
