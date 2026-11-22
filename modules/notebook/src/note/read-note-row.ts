import type { Kysely } from 'kysely';
import type { NoteRow, NotebookTables } from '../types';

// A tool passes a short ID, and the client or a link passes either form.
export async function readNoteRow(db: Kysely<unknown>, id: string): Promise<NoteRow | null> {
  const row = await db
    .$extendTables<NotebookTables>()
    .selectFrom('notebook_notes')
    .selectAll()
    .where((eb) => eb.or([eb('short_id', '=', id), eb('note_id', '=', id)]))
    .executeTakeFirst();

  return row ?? null;
}

// A note that is being forgotten, or was, is reachable by nothing: it reads as unknown.
export async function readActiveNoteRow(db: Kysely<unknown>, id: string): Promise<NoteRow | null> {
  const row = await readNoteRow(db, id);

  return row?.state === 'active' ? row : null;
}
