import type { Log } from '@heynixie/log';
import { readNoteText } from '../note/read-note-text';
import type { NotebookTables } from '../types';

export interface LinkingNote {
  readonly note: string;

  // left out for a private note
  readonly title?: string;
}

// The active notes that link to one record of the log, for the confirmation of a record forget: a
// note keeps its own text of the record until the note itself is forgotten.
export async function readNotesLinkingEvent(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  sequence: number,
): Promise<readonly LinkingNote[]> {
  const rows = await log.writer.db
    .$extendTables<NotebookTables>()
    .selectFrom('notebook_links')
    .innerJoin('notebook_notes', 'notebook_notes.note_id', 'notebook_links.from_note_id')
    .select([
      'notebook_notes.short_id',
      'notebook_notes.is_private',
      'notebook_notes.text_seq',
      'notebook_notes.created_at',
    ])
    .where('notebook_links.target_kind', '=', 'event')
    .where('notebook_links.target_id', '=', String(sequence))
    .where('notebook_notes.state', '=', 'active')
    .orderBy('notebook_notes.created_at')
    .orderBy('notebook_notes.short_id')
    .distinct()
    .execute();

  return Promise.all(
    rows.map(async (row): Promise<LinkingNote> => {
      if (row.is_private === 1) {
        return { note: row.short_id };
      }

      const text = await readNoteText(log, row.text_seq);

      return text === null ? { note: row.short_id } : { note: row.short_id, title: text.title };
    }),
  );
}
