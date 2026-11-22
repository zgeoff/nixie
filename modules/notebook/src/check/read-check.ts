import type { NoteIndex } from '../index/start-note-index';
import { readLinkReasons } from '../link/read-link-reasons';
import { buildTargetKey, readTargetInfos } from '../link/read-target-infos';
import type { NotebookContext, NotebookTables } from '../types';
import type { CheckLink, NotebookCheck } from './build-check';
import { buildCheck } from './build-check';

export interface CheckReadOptions {
  readonly isPrivateShown: boolean;
}

// Builds the check when it is read and stores nothing, so it holds no copy of a note's text. It
// reads every active note, so the client's check can leave out the private entries afterwards.
export async function readCheck(
  context: NotebookContext,
  index: NoteIndex,
  options: CheckReadOptions,
): Promise<NotebookCheck> {
  const notes = index.listMetas();

  const active = new Map(notes.map((meta) => [meta.noteID, meta]));

  const rows = await context.log.writer.db
    .$extendTables<NotebookTables>()
    .selectFrom('notebook_links')
    .selectAll()
    .execute();

  const fromActive = rows.filter((row) => active.has(row.from_note_id));

  const infos = await readTargetInfos(
    context,
    fromActive.map((row) => ({ kind: row.target_kind, id: row.target_id })),
  );

  const reasons = await readLinkReasons(
    context.log,
    fromActive.flatMap((row) =>
      row.type === 'related' && row.reason_seq !== null ? [row.reason_seq] : [],
    ),
  );

  const links = fromActive.flatMap((row): CheckLink[] => {
    const from = active.get(row.from_note_id);
    const target = infos.get(buildTargetKey({ kind: row.target_kind, id: row.target_id }));

    if (from === undefined || target === undefined) {
      return [];
    }

    return [
      {
        fromNoteID: row.from_note_id,
        fromShortID: from.shortID,
        type: row.type,
        kind: row.target_kind,
        targetID: row.target_id,
        targetShownID: target.shownID,
        isGone: target.isGone,
        reason: row.reason_seq === null ? null : (reasons.get(row.reason_seq) ?? null),
        createdAt: row.created_at,
      },
    ];
  });

  return buildCheck(
    notes.map((meta) => ({
      noteID: meta.noteID,
      shortID: meta.shortID,
      title: meta.title,
      editedAt: meta.editedAt,
      isPrivate: meta.isPrivate,
    })),
    links,
    {
      checkReasonRepeats: context.settings.checkReasonRepeats,
      isPrivateShown: options.isPrivateShown,
    },
  );
}
