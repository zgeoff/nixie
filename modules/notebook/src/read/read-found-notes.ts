import type { Log } from '@heynixie/log';
import { splitContentWords } from '@heynixie/memory';
import type { NoteIndex, NoteMeta, SearchMode } from '../index/start-note-index';
import { hasEveryTag } from '../note/merge-tags';
import { pickMatchSnippet } from '../note/pick-match-snippet';
import { readNoteText } from '../note/read-note-text';

export interface FindRequest {
  readonly query?: string;
  readonly tags?: readonly string[];
  readonly by?: SearchMode;
  readonly order?: 'newest' | 'oldest';

  // the cursor of the page before
  readonly after?: string;

  // false leaves out every private note, for the client's view
  readonly isPrivateShown?: boolean;
}

export interface FoundNote {
  readonly meta: NoteMeta;
  readonly match: string | null;
  readonly score: { readonly words: number | null; readonly meaning: number | null } | null;
}

export interface FoundNotes {
  readonly notes: readonly FoundNote[];
  readonly next: string | null;
  readonly isMeaningPartial: boolean;
}

export const findPageSize = 20;

export interface FindContext {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
}

// With a query, the notes rank by words, meaning or both, and the cursor is the offset into that
// ranking. With none, they list by last edit, and the cursor is the last note's position.
export async function readFoundNotes(
  context: FindContext,
  index: NoteIndex,
  request: FindRequest,
): Promise<FoundNotes> {
  const tags = request.tags ?? [];

  const metas = index
    .listMetas()
    .filter(
      (meta) =>
        hasEveryTag(meta.tags, tags) && (request.isPrivateShown !== false || !meta.isPrivate),
    );

  const query = request.query?.trim() ?? '';

  if (query === '') {
    return listNotes(metas, request);
  }

  const search = await index.readMatches(query, request.by ?? 'both');

  const allowed = new Map(metas.map((meta) => [meta.noteID, meta]));

  const ranked = search.ranked.flatMap((match) => {
    const meta = allowed.get(match.itemID);

    return meta === undefined ? [] : [{ meta, match }];
  });

  const offset = Number(request.after ?? '0');
  const page = ranked.slice(offset, offset + findPageSize);
  const words = splitContentWords(query);

  const notes = await Promise.all(
    page.map(async (entry): Promise<FoundNote> => {
      const meta = entry.meta;
      const match = entry.match;

      const text = await readNoteText(context.log, meta.textSeq);

      return {
        meta,
        match: pickMatchSnippet(text?.body ?? '', words),
        score: { words: match.score ?? null, meaning: match.similarity ?? null },
      };
    }),
  );

  return {
    notes,
    next: offset + findPageSize < ranked.length ? String(offset + findPageSize) : null,
    isMeaningPartial: search.isMeaningPartial,
  };
}

function listNotes(metas: readonly NoteMeta[], request: FindRequest): FoundNotes {
  const direction = request.order === 'oldest' ? 1 : -1;

  const ordered = metas.toSorted(
    (first, second) =>
      direction * (first.editedAt - second.editedAt) ||
      direction * first.shortID.localeCompare(second.shortID),
  );

  const start = request.after === undefined ? 0 : getStart(ordered, request.after, direction);
  const page = ordered.slice(start, start + findPageSize);
  const last = page.at(-1);

  return {
    notes: page.map((meta) => ({ meta, match: null, score: null })),
    next: start + findPageSize < ordered.length && last !== undefined ? buildCursor(last) : null,
    isMeaningPartial: false,
  };
}

export function buildCursor(meta: Pick<NoteMeta, 'editedAt' | 'shortID'>): string {
  return `${String(meta.editedAt)}.${meta.shortID}`;
}

// The cursor names the last note of the page before, so the page starts after it, even when that
// note has since moved.
function getStart(ordered: readonly NoteMeta[], cursor: string, direction: number): number {
  const at = ordered.findIndex((meta) => buildCursor(meta) === cursor);

  if (at !== -1) {
    return at + 1;
  }

  const [editedAt = ''] = cursor.split('.');
  const edited = Number(editedAt);
  const past = ordered.findIndex((meta) => direction * (meta.editedAt - edited) > 0);

  return past === -1 ? ordered.length : past;
}
