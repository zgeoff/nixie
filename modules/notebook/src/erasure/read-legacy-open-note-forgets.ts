import type { ErasureBy, LogTables } from '@heynixie/log';
import { sql } from 'kysely';
import { forgetBySchema } from '../record/forget-by-schema';
import type { NotebookContext, NotebookTables } from '../types';
import type { NoteErasureRequest } from './build-note-erasable';

// A note that an earlier release's forget left in forgetting, with no erasure.started to finish it.
export async function readLegacyOpenNoteForgets(
  context: Pick<NotebookContext, 'log'>,
): Promise<readonly { request: NoteErasureRequest; by: ErasureBy }[]> {
  const db = context.log.writer.db.$extendTables<NotebookTables & LogTables>();

  const rows = await db
    .selectFrom('notebook_notes')
    .select('note_id')
    .where('state', '=', 'forgetting')
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('records')
            .select('sequence')
            .where('kind', '=', 'erasure.started')
            .where(sql`json_extract(payload, '$.targetID')`, '=', sql`notebook_notes.note_id`),
        ),
      ),
    )
    .execute();

  const forgets: { request: NoteErasureRequest; by: ErasureBy }[] = [];

  for (const row of rows) {
    const begun = await db
      .selectFrom('records')
      .select(sql`json_extract(payload, '$.by')`.as('by'))
      .where('kind', '=', 'notebook.note_forgetting')
      .where(sql`json_extract(payload, '$.note')`, '=', row.note_id)
      .orderBy('sequence', 'desc')
      .executeTakeFirst();

    forgets.push({
      request: { note: row.note_id, isResuming: true },
      by: forgetBySchema.parse(begun?.by ?? undefined),
    });
  }

  return forgets;
}
