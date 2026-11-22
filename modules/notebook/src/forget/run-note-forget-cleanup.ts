import type { LogTables } from '@heynixie/log';
import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import type { NoteIndex } from '../index/start-note-index';
import { noteForgottenCodec } from '../record/note-forgotten-codec';
import type { NotebookContext, NotebookTables } from '../types';

// Every step is safe to run twice, so the server's start finishes a forget that a crash cut short.
// It deletes the key of every version record and of every link record from the note, replaced
// reasons included, then drops the index entry, cleans sessions and writes note_forgotten.
export async function runNoteForgetCleanup(
  context: NotebookContext,
  index: NoteIndex,
  noteID: string,
): Promise<void> {
  const db = context.log.writer.db.$extendTables<NotebookTables & LogTables>();

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

  for (const key of [...versionKeys, ...linkKeys]) {
    if (key.key_id !== null) {
      await removeRecordKey(context.log, key.key_id);
    }
  }

  await index.drop(noteID);
  await context.cleanupSessions({ noteID });

  await withWriteTransaction(context.log.writer, async (tx) => {
    const row = await tx
      .$extendTables<NotebookTables>()
      .selectFrom('notebook_notes')
      .select(['state', 'short_id'])
      .where('note_id', '=', noteID)
      .executeTakeFirst();

    if (row?.state !== 'forgetting') {
      return;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'notebook.note_forgotten',
        definitions: context.definitions(),
        payload: noteForgottenCodec.encode({ note: noteID, shortID: row.short_id }),
      },
    ]);
  });
}
