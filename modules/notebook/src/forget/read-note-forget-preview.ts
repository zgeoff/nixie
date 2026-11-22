import { readNoteLinks } from '../link/read-note-links';
import { readActiveNoteRow } from '../note/read-note-row';
import { readNoteText } from '../note/read-note-text';
import type { NotebookContext } from '../types';

export interface NoteForgetPreview {
  readonly note: string;
  readonly version: number;
  readonly title: string;
  readonly versionCount: number;
  readonly linkCount: number;
  readonly backlinkCount: number;
}

export type NoteForgetPreviewRead =
  | { readonly status: 'ready'; readonly preview: NoteForgetPreview }
  | { readonly status: 'unknown' };

// Works on a private note without opening it: the preview shows the title and counts, never the
// body, and appends no record.
export async function readNoteForgetPreview(
  context: NotebookContext,
  noteID: string,
): Promise<NoteForgetPreviewRead> {
  const row = await readActiveNoteRow(context.log.writer.db, noteID);

  if (row === null) {
    return { status: 'unknown' };
  }

  const text = await readNoteText(context.log, row.text_seq);
  const links = await readNoteLinks(context, row.note_id, 0);

  return {
    status: 'ready',
    preview: {
      note: row.short_id,
      version: row.version,
      title: text?.title ?? '',
      versionCount: row.version,
      linkCount: links.linkCount,
      backlinkCount: links.backlinkCount,
    },
  };
}
