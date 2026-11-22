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

  const repeatedReasons = collectRepeatedReasons(rows, showPrivate, privateNotes);

  return {
    orphans,
    dangling,
    repeatedReasons,
    orphanCount: orphans.length,
    danglingCount: dangling.length,
    repeatedReasonCount: repeatedReasons.length,
  };
}

type MockNoteRow = ReturnType<typeof mockViewStore.notes.all>[number];

// The API's setting: a related reason is repeated on more links than this.
const reasonRepeats = 3;

// Two reasons are the same after trimming, collapsing runs of spaces and ignoring case. Only related
// links count, and a group lists the links that stay visible.
function collectRepeatedReasons(
  rows: readonly MockNoteRow[],
  showPrivate: boolean,
  privateNotes: ReadonlySet<string>,
) {
  const groups = new Map<
    string,
    { reason: string; links: { from: string; to: Record<string, string> }[]; total: number }
  >();

  for (const row of rows) {
    for (const link of row.links) {
      if (link.type !== 'related' || link.reason === null) {
        continue;
      }

      const key = link.reason.trim().replaceAll(/\s+/gu, ' ').toLowerCase();
      const group = groups.get(key) ?? { reason: link.reason, links: [], total: 0 };

      const isHidden =
        !showPrivate &&
        (privateNotes.has(row.note) || (link.kind === 'note' && privateNotes.has(link.target)));

      group.total += 1;

      if (!isHidden) {
        group.links.push({ from: row.note, to: { [link.kind]: link.target } });
      }

      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .filter((group) => group.total > reasonRepeats && group.links.length > 0)
    .map((group) => ({ reason: group.reason, count: group.links.length, links: group.links }));
}
