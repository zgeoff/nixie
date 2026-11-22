import { mockViewStore } from './mock-view-store';

// The check is built over every note, then the private entries go when showPrivate is off, so a
// note that only a private note links to never shows as an orphan.
export function readMockNoteCheck(showPrivate: boolean) {
  const rows = mockViewStore.notes.all().filter((row) => !row.isForgotten);

  const active = new Set(rows.map((row) => row.note));
  const privateNotes = new Set(rows.filter((row) => row.isPrivate).map((row) => row.note));

  const linkedTo = new Set(
    rows.flatMap((row) =>
      row.links.filter((link) => link.kind === 'note').map((link) => link.target),
    ),
  );

  const orphans = rows
    .filter((row) => row.links.length === 0 && !linkedTo.has(row.note))
    .filter((row) => showPrivate || !row.isPrivate)
    .map((row) => ({ note: row.note, title: row.versions.at(-1)?.title ?? '' }));

  const dangling = rows
    .filter((row) => showPrivate || !row.isPrivate)
    .flatMap((row) =>
      row.links
        .filter((link) => link.kind === 'note' && !active.has(link.target))
        .map((link) => ({ from: row.note, to: { [link.kind]: link.target }, type: link.type })),
    )
    .filter((entry) => showPrivate || !privateNotes.has(entry.from));

  return {
    orphans,
    dangling,
    repeatedReasons: [],
    orphanCount: orphans.length,
    danglingCount: dangling.length,
    repeatedReasonCount: 0,
  };
}
