import type { JSONObject } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { recallPageLimitBytes } from '@heynixie/wire';
import type { NoteIndex } from '../index/start-note-index';
import { readNoteLinks } from '../link/read-note-links';
import type { BodyMatch } from '../note/collect-body-matches';
import { collectBodyMatches } from '../note/collect-body-matches';
import { cutBodyMatches, matchBudgetBytes } from '../note/cut-body-matches';
import { cutBodyParts } from '../note/cut-body-parts';
import { formatUTC } from '../note/format-utc';
import type { NoteRefusal } from '../note/note-refusal';
import { buildRefusal } from '../note/note-refusal';
import { readActiveNoteRow } from '../note/read-note-row';
import { readNoteText } from '../note/read-note-text';
import { noteReadCodec } from '../record/note-read-codec';
import type { NotebookContext, NotebookTables } from '../types';

export interface NoteReadRequest {
  readonly note: string;
  readonly version?: number;
  readonly part?: number;
  readonly find?: string;
}

export type NoteReadOutcome =
  | { readonly status: 'read'; readonly view: JSONObject; readonly noteID: string }
  | { readonly status: 'refused'; readonly refusal: NoteRefusal };

const maxLinks = 25;

// Room for the JSON around a body that the byte count leaves out, so a whole result stays under
// the limit.
const marginBytes = 200;

export async function readNote(
  context: NotebookContext,
  index: NoteIndex,
  request: NoteReadRequest,
): Promise<NoteReadOutcome> {
  const db = context.log.writer.db.$extendTables<NotebookTables>();

  const row = await readActiveNoteRow(context.log.writer.db, request.note);

  if (row === null) {
    return refuse('UNKNOWN_NOTE', `no note has the ID ${request.note}`);
  }

  const version = request.version ?? row.version;

  const versionRow =
    version === row.version
      ? { seq: row.text_seq, created_at: row.edited_at }
      : await db
          .selectFrom('notebook_versions')
          .select(['seq', 'created_at'])
          .where('note_id', '=', row.note_id)
          .where('version', '=', version)
          .executeTakeFirst();

  const text = versionRow === undefined ? null : await readNoteText(context.log, versionRow.seq);

  if (versionRow === undefined || text === null) {
    return refuse(
      'UNKNOWN_VERSION',
      `note ${row.short_id} has no version ${String(version)}; it holds ${String(row.version)}`,
    );
  }

  const links = await readNoteLinks(context, row.note_id, maxLinks);

  const first = buildMetadata(
    { row, version, text, versionAt: versionRow.created_at },
    {
      links: links.links.map((entry) => ({
        type: entry.type,
        to: { [entry.target.kind]: entry.target.shownID },
        ...(entry.reason === null ? {} : { reason: entry.reason }),
        ...(entry.target.isGone ? { isGone: true } : {}),
      })),
      backlinks: links.backlinks.map((entry) => ({
        type: entry.type,
        from: entry.from,
        title: index.findMeta(entry.fromNoteID)?.title ?? '',
      })),
      linkCount: links.linkCount,
      backlinkCount: links.backlinkCount,
    },
  );

  const rest = buildMetadata({ row, version, text, versionAt: versionRow.created_at }, null);
  const firstBudget = recallPageLimitBytes - Buffer.byteLength(JSON.stringify(first)) - marginBytes;
  const restBudget = recallPageLimitBytes - Buffer.byteLength(JSON.stringify(rest)) - marginBytes;
  const cut = cutWithMatches(text.body, request.find, firstBudget, restBudget);
  const parts = cut.parts;
  const found = cut.found;

  if (request.find !== undefined && found.length === 0) {
    return {
      status: 'refused',
      refusal: buildRefusal(
        'NOT_FOUND',
        `the text does not appear in version ${String(version)} of note ${row.short_id}, which has ${String(parts.length)} parts`,
        { parts: parts.length },
      ),
    };
  }

  const part = found[0]?.part ?? request.part ?? 1;

  if (part > parts.length) {
    return refuse(
      'UNKNOWN_PART',
      `note ${row.short_id} has ${String(parts.length)} parts, and no part ${String(part)}`,
    );
  }

  await writeRecords(context.log, [
    {
      kind: 'notebook.note_read',
      definitions: context.definitions(),
      payload: noteReadCodec.encode({ note: row.note_id }),
    },
  ]);

  const view: JSONObject = {
    ...(part === 1 ? first : rest),
    body: parts[part - 1] ?? '',
    part,
    parts: parts.length,
    ...(request.find === undefined
      ? {}
      : { matches: found.map((match) => ({ part: match.part, text: match.text })) }),
  };

  return { status: 'read', view, noteID: row.note_id };
}

function refuse(code: string, message: string): NoteReadOutcome {
  return { status: 'refused', refusal: buildRefusal(code, message) };
}

interface NoteFacts {
  readonly row: {
    readonly short_id: string;
    readonly version: number;
    readonly is_private: number;
    readonly read_at: number | null;
    readonly owner_opened_at: number | null;
  };
  readonly version: number;
  readonly text: { readonly title: string; readonly tags: readonly string[] };
  readonly versionAt: number;
}

// Every part holds these, and part 1 alone adds the links.
function buildMetadata(facts: NoteFacts, links: JSONObject | null): JSONObject {
  const row = facts.row;

  return {
    note: row.short_id,
    version: facts.version,
    versionCount: row.version,
    title: facts.text.title,
    tags: [...facts.text.tags],
    isPrivate: row.is_private === 1,
    updatedAt: formatUTC(facts.versionAt),
    readAt: row.read_at === null ? null : formatUTC(row.read_at),
    ...(row.is_private === 1
      ? { ownerOpenedAt: row.owner_opened_at === null ? null : formatUTC(row.owner_opened_at) }
      : {}),
    ...links,
  };
}

// The matches ride beside the body in the result, so the body's budget gives up the most they can
// spend, and the matches are cut to that. Where the parts fall changes only a match's part number,
// so one more cut settles both.
function cutWithMatches(
  body: string,
  find: string | undefined,
  firstBudgetBytes: number,
  restBudgetBytes: number,
): { readonly parts: readonly string[]; readonly found: readonly BodyMatch[] } {
  if (find === undefined) {
    return { parts: cutBodyParts(body, firstBudgetBytes, restBudgetBytes), found: [] };
  }

  const parts = cutBodyParts(
    body,
    firstBudgetBytes - matchBudgetBytes,
    restBudgetBytes - matchBudgetBytes,
  );

  return { parts, found: cutBodyMatches(collectBodyMatches(body, parts, find), matchBudgetBytes) };
}
