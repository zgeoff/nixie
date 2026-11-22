import type { Log } from '@heynixie/log';
import type { MemoryIndex, RankedMatch, SemanticSearch, VectorIndex } from '@heynixie/memory';
import {
  defaultMinSimilarity,
  mergeRankings,
  startMemoryIndex,
  startVectorIndex,
} from '@heynixie/memory';
import { readNoteText } from '../note/read-note-text';
import type { NotebookTables } from '../types';

export interface NoteMeta {
  readonly noteID: string;
  readonly shortID: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly version: number;
  readonly editedAt: number;
  readonly isPrivate: boolean;

  // the record that holds the current title, body and tags
  readonly textSeq: number;
}

export type SearchMode = 'words' | 'meaning' | 'both';

export interface NoteSearch {
  readonly ranked: readonly RankedMatch[];
  readonly isMeaningPartial: boolean;
}

export interface NoteIndex {
  // Decrypts the current version of every active note into the indexes. The vectors encode in the
  // background, and a search reports a partial meaning until they finish.
  readonly load: () => Promise<void>;
  readonly put: (meta: NoteMeta, body: string) => Promise<void>;
  readonly drop: (noteID: string) => Promise<void>;
  readonly findMeta: (noteID: string) => NoteMeta | undefined;
  readonly listMetas: () => readonly NoteMeta[];
  readonly readMatches: (query: string, mode: SearchMode) => Promise<NoteSearch>;

  // resolves once the background encoding of the notes read at start is over; true when it worked
  readonly waitForLoadedVectors: () => Promise<boolean>;
  readonly stop: () => Promise<void>;
}

export interface NoteIndexOptions {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly semanticSearch: SemanticSearch | undefined;
}

// Both indexes live in process memory only, so a forgotten note's words never outlive the process.
export async function startNoteIndex(options: NoteIndexOptions): Promise<NoteIndex> {
  const keywords = await startMemoryIndex();

  const semantic = options.semanticSearch;

  const state = {
    metas: new Map<string, NoteMeta>(),
    vectors: semantic === undefined ? null : startVectorIndex(semantic.encoder, semantic.onError),
    loadedVectors: Promise.resolve(false),
  };

  return {
    load: () => loadNotes(options, keywords, state),
    put: async (meta, body) => {
      state.metas.set(meta.noteID, meta);

      const entry = { itemID: meta.noteID, text: buildIndexText(meta, body) };

      await keywords.update(entry);

      state.vectors?.update(entry);
    },
    drop: async (noteID) => {
      state.metas.delete(noteID);

      await keywords.remove(noteID);

      state.vectors?.remove(noteID);
    },
    findMeta: (noteID) => state.metas.get(noteID),
    listMetas: () => [...state.metas.values()],
    readMatches: (query, mode) =>
      readNoteMatches({ keywords, vectors: state.vectors }, query, mode),
    waitForLoadedVectors: () => state.loadedVectors,
    stop: async () => {
      await state.vectors?.stop();
      await keywords.stop();
    },
  };
}

interface LoadState {
  readonly metas: Map<string, NoteMeta>;
  readonly vectors: VectorIndex | null;
  loadedVectors: Promise<boolean>;
}

async function loadNotes(
  options: NoteIndexOptions,
  keywords: MemoryIndex,
  state: LoadState,
): Promise<void> {
  const rows = await options.log.writer.db
    .$extendTables<NotebookTables>()
    .selectFrom('notebook_notes')
    .selectAll()
    .where('state', '=', 'active')
    .execute();

  const entries: { itemID: string; text: string }[] = [];

  state.metas.clear();

  for (const row of rows) {
    const text = await readNoteText(options.log, row.text_seq);

    if (text === null) {
      continue;
    }

    const meta: NoteMeta = {
      noteID: row.note_id,
      shortID: row.short_id,
      title: text.title,
      tags: text.tags,
      version: row.version,
      editedAt: row.edited_at,
      isPrivate: row.is_private === 1,
      textSeq: row.text_seq,
    };

    state.metas.set(meta.noteID, meta);
    entries.push({ itemID: meta.noteID, text: buildIndexText(meta, text.body) });
  }

  await keywords.updateAll(entries);

  state.loadedVectors =
    state.vectors === null ? Promise.resolve(false) : state.vectors.rebuild(entries);
}

function buildIndexText(meta: Pick<NoteMeta, 'title' | 'tags'>, body: string): string {
  return `${meta.title}\n${meta.tags.join(' ')}\n${body}`;
}

interface SearchIndexes {
  readonly keywords: MemoryIndex;
  readonly vectors: VectorIndex | null;
}

const searchLimit = 5000;

async function readNoteMatches(
  indexes: SearchIndexes,
  query: string,
  mode: SearchMode,
): Promise<NoteSearch> {
  const words =
    mode === 'meaning'
      ? []
      : await indexes.keywords.readMatches(query, { limit: searchLimit, minScore: 0 });

  if (mode === 'words') {
    return { ranked: mergeRankings(words, []), isMeaningPartial: false };
  }

  if (indexes.vectors === null) {
    return { ranked: mergeRankings(words, []), isMeaningPartial: true };
  }

  const isEncoded = await waitForEncoding(indexes.vectors);

  const meaning = await indexes.vectors.readMatches(query, {
    limit: searchLimit,
    minSimilarity: defaultMinSimilarity,
  });

  return {
    ranked: mergeRankings(words, meaning ?? []),
    isMeaningPartial: meaning === null || !isEncoded,
  };
}

const encodeWaitMs = 5000;

// Waits up to 5 seconds for the notes written or edited since the last search to encode.
async function waitForEncoding(vectors: VectorIndex): Promise<boolean> {
  const timer: { id: ReturnType<typeof setTimeout> | undefined } = { id: undefined };

  const timeout = new Promise<boolean>((resolve) => {
    timer.id = setTimeout(() => {
      resolve(false);
    }, encodeWaitMs);
  });

  const idle = (async () => {
    await vectors.waitForIdle();

    return true;
  })();

  const isIdle = await Promise.race([idle, timeout]);

  clearTimeout(timer.id);

  return isIdle;
}
