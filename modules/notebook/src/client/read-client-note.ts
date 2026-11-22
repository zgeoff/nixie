import { readRecords } from '@heynixie/log';
import { readMomentLabels } from '@heynixie/memory';
import type { NoteIndex } from '../index/start-note-index';
import { readNoteLinks } from '../link/read-note-links';
import type { TargetInfo } from '../link/read-target-infos';
import { readActiveNoteRow } from '../note/read-note-row';
import { readNoteText } from '../note/read-note-text';
import { readNoteHistory } from '../read/read-note-history';
import type { HistoryEntry } from '../read/read-note-history';
import type { LinkType, NotebookContext, NotebookTables, TargetKind } from '../types';

export interface ClientLink {
  readonly type: LinkType;
  readonly kind: TargetKind;
  readonly target: string;
  readonly reason: string | null;
  readonly isGone: boolean;

  // the target's title or gist, or an event's text start
  readonly label: string | null;
  readonly event: { readonly at: number; readonly role: string } | null;
}

export interface ClientBacklink {
  readonly type: LinkType;
  readonly from: string;
  readonly title: string;
}

export interface ClientNote {
  readonly note: string;
  readonly version: number;
  readonly versionCount: number;
  readonly title: string;
  readonly tags: readonly string[];
  readonly isPrivate: boolean;

  // a private note leaves out its body, which only the checked open returns
  readonly body: string | null;
  readonly links: readonly ClientLink[];
  readonly backlinks: readonly ClientBacklink[];
  readonly history: readonly HistoryEntry[];
  readonly historyNext: string | null;
  readonly readAt: number | null;
  readonly ownerOpenedAt: number | null;
}

export type ClientNoteRead =
  | { readonly status: 'unknown' }

  // a private note while showPrivate is off: nothing but its ID
  | { readonly status: 'hidden'; readonly note: string }
  | { readonly status: 'read'; readonly note: ClientNote };

export interface ClientNoteRequest {
  readonly note: string;
  readonly version?: number;
  readonly isPrivateShown: boolean;
  readonly historyAfter?: string;
}

// The client is the owner's own view, so every target shows its title or gist.
export async function readClientNote(
  context: NotebookContext,
  index: NoteIndex,
  request: ClientNoteRequest,
): Promise<ClientNoteRead> {
  const db = context.log.writer.db.$extendTables<NotebookTables>();

  const row = await readActiveNoteRow(context.log.writer.db, request.note);

  if (row === null) {
    return { status: 'unknown' };
  }

  const isPrivate = row.is_private === 1;

  if (isPrivate && !request.isPrivateShown) {
    return { status: 'hidden', note: row.short_id };
  }

  const version = request.version ?? row.version;

  const versionRow =
    version === row.version
      ? { seq: row.text_seq }
      : await db
          .selectFrom('notebook_versions')
          .select('seq')
          .where('note_id', '=', row.note_id)
          .where('version', '=', version)
          .executeTakeFirst();

  const text = versionRow === undefined ? null : await readNoteText(context.log, versionRow.seq);

  if (text === null) {
    return { status: 'unknown' };
  }

  const links = await readNoteLinks(context, row.note_id, null);

  const historyAfter = request.historyAfter === undefined ? null : Number(request.historyAfter);

  const history = await readNoteHistory(context, row.note_id, historyAfter);

  const isHidden = (noteID: string): boolean =>
    !request.isPrivateShown && index.findMeta(noteID)?.isPrivate === true;

  const labelled = await Promise.all(
    links.links
      .filter((link) => !(link.target.kind === 'note' && isHidden(link.target.id)))
      .map((link) => readClientLink(context, index, link)),
  );

  return {
    status: 'read',
    note: {
      note: row.short_id,
      version,
      versionCount: row.version,
      title: text.title,
      tags: text.tags,
      isPrivate,
      body: isPrivate ? null : text.body,
      links: labelled,
      backlinks: links.backlinks
        .filter((link) => !isHidden(link.fromNoteID))
        .map((link) => ({
          type: link.type,
          from: link.from,
          title: index.findMeta(link.fromNoteID)?.title ?? '',
        })),
      history: history.status === 'read' ? history.versions : [],
      historyNext: history.status === 'read' ? history.next : null,
      readAt: row.read_at,
      ownerOpenedAt: row.owner_opened_at,
    },
  };
}

const eventTextChars = 200;

const roles: Readonly<Record<string, string>> = {
  owner_message: 'owner',
  'model.reply': 'assistant',
  tool_result: 'tool',
  task_message: 'task',
};

interface ClientLinkSource {
  readonly type: LinkType;
  readonly target: TargetInfo;
  readonly reason: string | null;
}

async function readClientLink(
  context: NotebookContext,
  index: NoteIndex,
  link: ClientLinkSource,
): Promise<ClientLink> {
  const target = link.target;
  const base = { type: link.type, kind: target.kind, target: target.shownID, reason: link.reason };

  if (target.isGone) {
    return { ...base, isGone: true, label: null, event: null };
  }

  if (target.kind === 'note') {
    return { ...base, isGone: false, label: index.findMeta(target.id)?.title ?? null, event: null };
  }

  if (target.kind === 'memory') {
    return { ...base, isGone: false, label: await context.memory.readGist(target.id), event: null };
  }

  if (target.kind === 'moment') {
    const labels = await readMomentLabels(context.log, [target.id]);

    return { ...base, isGone: false, label: labels.get(target.id)?.title ?? null, event: null };
  }

  const [entry] = await readRecords(context.log, {
    afterSequence: Number(target.id) - 1,
    sequences: [Number(target.id)],
    limit: 1,
  });

  const fields = entry?.record.erasable.status === 'readable' ? entry.record.erasable.fields : {};
  const text = fields['text'] ?? fields['body'];

  return {
    ...base,
    isGone: false,
    label: typeof text === 'string' ? text.slice(0, eventTextChars) : null,
    event:
      target.event === null
        ? null
        : { at: target.event.at, role: roles[target.event.kind] ?? 'tool' },
  };
}
