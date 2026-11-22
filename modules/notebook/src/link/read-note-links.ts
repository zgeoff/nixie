import type { LinkType, NotebookContext, NotebookTables } from '../types';
import { readLinkReasons } from './read-link-reasons';
import type { TargetInfo } from './read-target-infos';
import { buildTargetKey, readTargetInfos } from './read-target-infos';

interface NoteLinkEntry {
  readonly type: LinkType;
  readonly target: TargetInfo;
  readonly reason: string | null;
}

interface NoteBacklinkEntry {
  readonly type: LinkType;
  readonly fromNoteID: string;
  readonly from: string;
}

export interface NoteLinks {
  readonly links: readonly NoteLinkEntry[];
  readonly backlinks: readonly NoteBacklinkEntry[];
  readonly linkCount: number;
  readonly backlinkCount: number;
}

// A note's own links, and the links of other active notes to it, oldest first. limit cuts each
// list and the counts give the totals; null cuts nothing.
export async function readNoteLinks(
  context: Pick<NotebookContext, 'log' | 'memory'>,
  noteID: string,
  limit: number | null,
): Promise<NoteLinks> {
  const db = context.log.writer.db.$extendTables<NotebookTables>();

  const out = await db
    .selectFrom('notebook_links')
    .selectAll()
    .where('from_note_id', '=', noteID)
    .orderBy('created_at')
    .orderBy('link_key')
    .execute();

  const incoming = await db
    .selectFrom('notebook_links')
    .innerJoin('notebook_notes', 'notebook_notes.note_id', 'notebook_links.from_note_id')
    .select(['notebook_links.type', 'notebook_links.from_note_id', 'notebook_notes.short_id'])
    .where('notebook_links.target_kind', '=', 'note')
    .where('notebook_links.target_id', '=', noteID)
    .where('notebook_notes.state', '=', 'active')
    .orderBy('notebook_links.created_at')
    .orderBy('notebook_links.link_key')
    .execute();

  const shown = limit === null ? out : out.slice(0, limit);

  const infos = await readTargetInfos(
    context,
    shown.map((row) => ({ kind: row.target_kind, id: row.target_id })),
  );

  const reasons = await readLinkReasons(
    context.log,
    shown.flatMap((row) => (row.reason_seq === null ? [] : [row.reason_seq])),
  );

  return {
    links: shown.flatMap((row) => {
      const target = infos.get(buildTargetKey({ kind: row.target_kind, id: row.target_id }));

      return target === undefined
        ? []
        : [
            {
              type: row.type,
              target,
              reason: row.reason_seq === null ? null : (reasons.get(row.reason_seq) ?? null),
            },
          ];
    }),
    backlinks: (limit === null ? incoming : incoming.slice(0, limit)).map((row) => ({
      type: row.type,
      fromNoteID: row.from_note_id,
      from: row.short_id,
    })),
    linkCount: out.length,
    backlinkCount: incoming.length,
  };
}
