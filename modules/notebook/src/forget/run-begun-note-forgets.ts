import type { NoteIndex } from '../index/start-note-index';
import type { NotebookContext, NotebookTables } from '../types';
import { runNoteForgetCleanup } from './run-note-forget-cleanup';

// Finishes each forget that a crash cut short, at the server's start.
export async function runBegunNoteForgets(
  context: NotebookContext,
  index: NoteIndex,
  noteID?: string,
): Promise<void> {
  const rows = await context.log.writer.db
    .$extendTables<NotebookTables>()
    .selectFrom('notebook_notes')
    .select('note_id')
    .where('state', '=', 'forgetting')
    .$if(noteID !== undefined, (query) => query.where('note_id', '=', noteID ?? ''))
    .execute();

  for (const row of rows) {
    await runNoteForgetCleanup(context, index, row.note_id);
  }
}
