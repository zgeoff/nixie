import { readActiveNoteRow } from '../note/read-note-row';
import { readNoteText } from '../note/read-note-text';
import type { NotebookContext, NotebookTables } from '../types';

export type PrivateBodies =
  | {
      readonly status: 'read';
      readonly body: string;
      readonly previousBody: string | null;
      readonly ownerOpenedAt: number | null;
    }
  | { readonly status: 'refused'; readonly reason: 'unknown' | 'not_private' };

export interface PrivateBodiesRequest {
  readonly note: string;
  readonly version?: number;
}

// A private note's body and the one before it, for the diff. The checked action keeps no body
// itself, so a retry reads them again.
export async function readPrivateBodies(
  context: NotebookContext,
  request: PrivateBodiesRequest,
): Promise<PrivateBodies> {
  const db = context.log.writer.db.$extendTables<NotebookTables>();

  const row = await readActiveNoteRow(context.log.writer.db, request.note);

  if (row === null) {
    return { status: 'refused', reason: 'unknown' };
  }

  if (row.is_private !== 1) {
    return { status: 'refused', reason: 'not_private' };
  }

  const version = request.version ?? row.version;

  const rows = await db
    .selectFrom('notebook_versions')
    .select(['version', 'seq'])
    .where('note_id', '=', row.note_id)
    .where('version', 'in', [version, version - 1])
    .execute();

  const current = rows.find((entry) => entry.version === version);
  const previous = rows.find((entry) => entry.version === version - 1);
  const body = current === undefined ? null : await readNoteText(context.log, current.seq);
  const before = previous === undefined ? null : await readNoteText(context.log, previous.seq);

  if (body === null) {
    return { status: 'refused', reason: 'unknown' };
  }

  return {
    status: 'read',
    body: body.body,
    previousBody: before?.body ?? null,
    ownerOpenedAt: row.owner_opened_at,
  };
}
