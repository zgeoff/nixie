import { mockViewStore } from './mock-view-store';
import { readMockBacklinks } from './read-mock-backlinks';
import { readMockNoteLinks } from './read-mock-note-links';

interface MockNoteInput {
  readonly note: string;
  readonly version?: number | undefined;
  readonly showPrivate?: boolean | undefined;
  readonly historyAfter?: string | undefined;
}

// A note as the web client reads it: a private note answers its ID alone with showPrivate off, and
// never answers its body.
export function readMockNote(input: MockNoteInput) {
  const row = mockViewStore.notes.findFirst((query) =>
    query.where((entry) => entry.note === input.note),
  );

  if (row === undefined || row.isForgotten || row.versions.length === 0) {
    return { status: 'unknown' as const };
  }

  const showPrivate = input.showPrivate === true;

  if (row.isPrivate && !showPrivate) {
    return { status: 'hidden' as const, note: row.note };
  }

  const read = readNoteFields(row, input);

  return read === null ? { status: 'unknown' as const } : { status: 'read' as const, note: read };
}

type MockNoteRow = ReturnType<typeof mockViewStore.notes.all>[number];

const historyPageSize = 50;

function readNoteFields(row: MockNoteRow, input: MockNoteInput) {
  const version = input.version ?? row.versions.length;
  const stored = row.versions[version - 1];

  if (stored === undefined) {
    return null;
  }

  const before =
    input.historyAfter === undefined ? row.versions.length + 1 : Number(input.historyAfter);

  const older = row.versions
    .map((entry, index) => ({ entry, version: index + 1 }))
    .filter((entry) => entry.version < before)
    .toSorted((left, right) => right.version - left.version);

  const page = older.slice(0, historyPageSize);
  const last = page.at(-1);

  return {
    note: row.note,
    version,
    versionCount: row.versions.length,
    title: stored.title,
    tags: stored.tags,
    isPrivate: row.isPrivate,
    body: row.isPrivate ? null : stored.body,
    links: readMockNoteLinks(row, input.showPrivate === true),
    backlinks: readMockBacklinks(row.note, input.showPrivate === true),
    history: page.map((entry) => ({
      version: entry.version,
      at: entry.entry.at,
      writer: entry.entry.writer,
      model: entry.entry.model,
      chars: entry.entry.body.length,
    })),
    historyNext: older.length > historyPageSize && last !== undefined ? String(last.version) : null,
    readAt: row.readAt,
    ownerOpenedAt: row.isPrivate ? row.ownerOpenedAt : null,
  };
}
