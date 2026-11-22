import { mockViewStore } from './mock-view-store';

// The active notes that link to a note. With showPrivate off, a private note and its links are left
// out, with no placeholder.
export function readMockBacklinks(note: string, showPrivate: boolean) {
  return mockViewStore.notes
    .all()
    .filter((row) => !row.isForgotten && row.note !== note && (showPrivate || !row.isPrivate))
    .flatMap((row) =>
      row.links
        .filter((link) => link.kind === 'note' && link.target === note)
        .map((link) => ({
          type: link.type,
          from: row.note,
          title: row.versions.at(-1)?.title ?? '',
        })),
    );
}
