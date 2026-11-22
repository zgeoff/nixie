import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { buildLinkTarget } from '../link/build-link-target';
import { parseLinkTarget } from '../link/parse-link-target';
import { resolveUnlinkTarget } from '../link/resolve-link-target';
import type { NoteRefusal } from '../note/note-refusal';
import { buildRefusal } from '../note/note-refusal';
import { readActiveNoteRow } from '../note/read-note-row';
import { buildLinkKey } from '../projection/build-link-key';
import { noteUnlinkedCodec } from '../record/note-unlinked-codec';
import type { NotebookContext, NotebookTables } from '../types';
import type { LinkRequest } from './write-note-link';
import { buildUnknownNote, toScope } from './write-note-link';

export type NoteUnlink =
  | { readonly status: 'unlinked'; readonly isUnlinked: boolean }
  | { readonly status: 'refused'; readonly refusal: NoteRefusal };

export async function writeNoteUnlink(
  context: NotebookContext,
  request: Omit<LinkRequest, 'reason'>,
): Promise<NoteUnlink> {
  const from = await readActiveNoteRow(context.log.writer.db, request.from);

  if (from === null) {
    return buildUnknownNote(request.from);
  }

  const parsed = parseLinkTarget(request.to);

  if (parsed === null) {
    return {
      status: 'refused',
      refusal: buildRefusal(
        'BAD_TARGET',
        `the ID in the unlink target of ${from.short_id} is in no valid format`,
      ),
    };
  }

  const resolved = await resolveUnlinkTarget(toScope(context, request.logThread), parsed);

  if (resolved === null) {
    return { status: 'unlinked', isUnlinked: false };
  }

  const target = buildLinkTarget(resolved.kind, resolved.id);
  const linkKey = buildLinkKey(from.note_id, target, request.type);

  const isUnlinked = await withWriteTransaction(context.log.writer, async (tx) => {
    const existing = await tx
      .$extendTables<NotebookTables>()
      .selectFrom('notebook_links')
      .select('link_key')
      .where('link_key', '=', linkKey)
      .executeTakeFirst();

    if (existing === undefined) {
      return false;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'notebook.unlinked',
        definitions: context.definitions(),
        payload: noteUnlinkedCodec.encode({ from: from.note_id, to: target, type: request.type }),
      },
    ]);

    return true;
  });

  return { status: 'unlinked', isUnlinked };
}
