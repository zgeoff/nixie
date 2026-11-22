import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { buildLinkTarget } from '../link/build-link-target';
import { isPartOfCycle } from '../link/is-part-of-cycle';
import type { ParsedTarget } from '../link/parse-link-target';
import { parseLinkTarget } from '../link/parse-link-target';
import { pickLinkRefusal } from '../link/pick-link-refusal';
import { resolveLinkTarget } from '../link/resolve-link-target';
import type { TargetScope } from '../link/resolve-link-target';
import type { NoteRefusal } from '../note/note-refusal';
import { buildRefusal } from '../note/note-refusal';
import { readActiveNoteRow } from '../note/read-note-row';
import { noteLinkedCodec } from '../record/note-linked-codec';
import type { LinkTarget, LinkType, NotebookContext, NotebookTables } from '../types';

export interface LinkRequest {
  readonly from: string;
  readonly to: LinkTarget;
  readonly type: LinkType;
  readonly reason?: string;

  // the thread the caller's event links must sit on
  readonly logThread: string;
}

export type NoteLink =
  | {
      readonly status: 'linked';

      // the UUIDs behind the short IDs a record shows, keyed by short ID
      readonly uuids: Readonly<Record<string, string>>;
      readonly from: string;
      readonly target: { readonly kind: ParsedTarget['kind']; readonly shownID: string };
    }
  | { readonly status: 'refused'; readonly refusal: NoteRefusal };

export function toScope(context: NotebookContext, logThread: string): TargetScope {
  return { log: context.log, memory: context.memory, logThread };
}

// The refusals in the design's order: UNKNOWN_NOTE, BAD_TARGET, UNKNOWN_TARGET, SELF_LINK,
// BAD_LINK, REASON_REQUIRED, then PART_OF_CYCLE, which the commit checks against the part-of links
// that exist then.
export async function writeNoteLink(
  context: NotebookContext,
  request: LinkRequest,
): Promise<NoteLink> {
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
        `the ID in the link target of ${from.short_id} is in no valid format`,
      ),
    };
  }

  const resolved = await resolveLinkTarget(toScope(context, request.logThread), parsed);

  if (resolved === null) {
    return {
      status: 'refused',
      refusal: buildRefusal('UNKNOWN_TARGET', `no ${parsed.kind} of yours has the ID ${parsed.id}`),
    };
  }

  const refusal = pickLinkRefusal({
    from: from.short_id,
    kind: resolved.kind,
    type: request.type,
    reason: request.reason,
    isSelf: resolved.kind === 'note' && resolved.id === from.note_id,
  });

  if (refusal !== null) {
    return { status: 'refused', refusal };
  }

  const target = buildLinkTarget(resolved.kind, resolved.id);

  const cycle = await withWriteTransaction(context.log.writer, async (tx) => {
    const current = await readActiveNoteRow(tx, from.note_id);

    if (current === null) {
      return 'unknown' as const;
    }

    if (request.type === 'part-of') {
      const edges = await tx
        .$extendTables<NotebookTables>()
        .selectFrom('notebook_links')
        .select(['from_note_id', 'target_id'])
        .where('type', '=', 'part-of')
        .where('target_kind', '=', 'note')
        .execute();

      const closes = isPartOfCycle(
        edges.map((edge) => ({ from: edge.from_note_id, to: edge.target_id })),
        { from: from.note_id, to: resolved.id },
      );

      if (closes) {
        return 'cycle' as const;
      }
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'notebook.linked',
        definitions: context.definitions(),
        payload: noteLinkedCodec.encode({ from: from.note_id, to: target, type: request.type }),
        ...(request.reason === undefined ? {} : { erasable: { reason: request.reason } }),
      },
    ]);

    return 'linked' as const;
  });

  if (cycle === 'unknown') {
    return buildUnknownNote(request.from);
  }

  if (cycle === 'cycle') {
    return {
      status: 'refused',
      refusal: buildRefusal(
        'PART_OF_CYCLE',
        `note ${from.short_id} cannot be part of ${resolved.shownID}: that note is already part of it`,
      ),
    };
  }

  return {
    status: 'linked',
    uuids: {
      [from.short_id]: from.note_id,
      ...(resolved.kind === 'event' ? {} : { [resolved.shownID]: resolved.id }),
    },
    from: from.short_id,
    target: { kind: resolved.kind, shownID: resolved.shownID },
  };
}

export function buildUnknownNote(id: string): {
  readonly status: 'refused';
  readonly refusal: NoteRefusal;
} {
  return {
    status: 'refused',
    refusal: buildRefusal('UNKNOWN_NOTE', `no note has the ID ${id}`),
  };
}
