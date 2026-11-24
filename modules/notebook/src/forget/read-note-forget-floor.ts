import type { Kysely } from 'kysely';
import type { NotebookTables } from '../types';

// The first record that can hold the forgotten note's text. Notes sit on no thread, so a forget of
// one deletes the logged model requests from this record on and names no threads. Null when the
// note has no row, and the caller then treats every request as covered.
export async function readNoteForgetFloor(
  db: Kysely<unknown>,
  noteID: string,
): Promise<number | null> {
  const row = await db
    .$extendTables<NotebookTables>()
    .selectFrom('notebook_versions')
    .select((eb) => eb.fn.min('seq').as('floor'))
    .where('note_id', '=', noteID)
    .executeTakeFirst();

  return row?.floor ?? null;
}
