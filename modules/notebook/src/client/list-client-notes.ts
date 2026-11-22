import type { NoteIndex } from '../index/start-note-index';
import type { FoundNotes } from '../read/read-found-notes';
import { readFoundNotes } from '../read/read-found-notes';
import type { NotebookContext, NotebookTables } from '../types';

export interface ClientNoteSummary {
  readonly note: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly version: number;
  readonly updatedAt: number;
  readonly backlinkCount: number;
  readonly isPrivate: boolean;
  readonly match: string | null;
}

export interface ClientNoteList {
  readonly notes: readonly ClientNoteSummary[];
  readonly next: string | null;
  readonly isMeaningPartial: boolean;
}

export interface ClientListRequest {
  readonly query?: string;
  readonly tags?: readonly string[];
  readonly isPrivateShown: boolean;
  readonly after?: string;
}

// Searches as notebook.find does with by 'both', 20 a page. With showPrivate off, a private note
// and every link to or from one leave the list and the counts.
export async function listClientNotes(
  context: NotebookContext,
  index: NoteIndex,
  request: ClientListRequest,
): Promise<ClientNoteList> {
  const found: FoundNotes = await readFoundNotes(context, index, {
    ...(request.query === undefined ? {} : { query: request.query }),
    ...(request.tags === undefined ? {} : { tags: request.tags }),
    ...(request.after === undefined ? {} : { after: request.after }),
    by: 'both',
    isPrivateShown: request.isPrivateShown,
  });

  const counts = await readBacklinkCounts(context, index, request.isPrivateShown);

  return {
    notes: found.notes.map((entry) => ({
      note: entry.meta.shortID,
      title: entry.meta.title,
      tags: entry.meta.tags,
      version: entry.meta.version,
      updatedAt: entry.meta.editedAt,
      backlinkCount: counts.get(entry.meta.noteID) ?? 0,
      isPrivate: entry.meta.isPrivate,
      match: entry.match,
    })),
    next: found.next,
    isMeaningPartial: found.isMeaningPartial,
  };
}

async function readBacklinkCounts(
  context: NotebookContext,
  index: NoteIndex,
  isPrivateShown: boolean,
): Promise<ReadonlyMap<string, number>> {
  const rows = await context.log.writer.db
    .$extendTables<NotebookTables>()
    .selectFrom('notebook_links')
    .select(['from_note_id', 'target_id'])
    .where('target_kind', '=', 'note')
    .execute();

  const counts = new Map<string, number>();

  for (const row of rows) {
    const from = index.findMeta(row.from_note_id);

    if (from === undefined || (!isPrivateShown && from.isPrivate)) {
      continue;
    }

    counts.set(row.target_id, (counts.get(row.target_id) ?? 0) + 1);
  }

  return counts;
}
