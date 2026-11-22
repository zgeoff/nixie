import { formatUTC } from '../note/format-utc';
import { readActiveNoteRow } from '../note/read-note-row';
import type { NotebookContext, NotebookTables } from '../types';

export interface HistoryEntry {
  readonly version: number;
  readonly at: string;
  readonly writer: string;
  readonly model: string;
  readonly chars: number;
}

export type NoteHistory =
  | {
      readonly status: 'read';
      readonly note: string;
      readonly versions: readonly HistoryEntry[];
      readonly next: string | null;
    }
  | { readonly status: 'unknown' };

export const historyPageSize = 50;

// The versions newest first, 50 a call. The cursor is the oldest version the page before showed.
export async function readNoteHistory(
  context: Pick<NotebookContext, 'log'>,
  noteID: string,
  after: number | null,
  pageSize: number = historyPageSize,
): Promise<NoteHistory> {
  const db = context.log.writer.db.$extendTables<NotebookTables>();

  const row = await readActiveNoteRow(context.log.writer.db, noteID);

  if (row === null) {
    return { status: 'unknown' };
  }

  const rows = await db
    .selectFrom('notebook_versions')
    .selectAll()
    .where('note_id', '=', row.note_id)
    .$if(after !== null, (query) => query.where('version', '<', after ?? 0))
    .orderBy('version', 'desc')
    .limit(pageSize + 1)
    .execute();

  const shown = rows.slice(0, pageSize);

  return {
    status: 'read',
    note: row.short_id,
    versions: shown.map((version) => ({
      version: version.version,
      at: formatUTC(version.created_at),
      writer: version.writer,
      model: version.model,
      chars: version.chars,
    })),
    next: rows.length > pageSize ? String(shown.at(-1)?.version ?? 0) : null,
  };
}
