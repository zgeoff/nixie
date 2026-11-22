import { mockViewStore } from './mock-view-store';
import { readMockBacklinks } from './read-mock-backlinks';

const pageSize = 20;

interface MockNotePageInput {
  readonly query?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly showPrivate?: boolean | undefined;
  readonly after?: string | undefined;
}

// The active notes of the mock store, newest edit first, in pages of the size the API uses. A search
// matches the words of the title, the tags and the body.
export function readMockNotePage(input: MockNotePageInput) {
  const skipped = input.after === undefined ? 0 : Number(input.after);
  const showPrivate = input.showPrivate === true;
  const words = (input.query ?? '').toLowerCase().split(/\s+/u).filter(Boolean);

  const matching = mockViewStore.notes
    .all()
    .filter((row) => !row.isForgotten && row.versions.length > 0)
    .filter((row) => showPrivate || !row.isPrivate)
    .filter((row) => {
      const current = row.versions.at(-1);
      const text = `${current?.title} ${current?.tags.join(' ')} ${current?.body}`.toLowerCase();

      return (
        (words.some((word) => text.includes(word)) || words.length === 0) &&
        (input.tags ?? []).every((tag) => current?.tags.includes(tag))
      );
    })
    .toSorted(
      (left, right) =>
        (right.versions.at(-1)?.at.getTime() ?? 0) - (left.versions.at(-1)?.at.getTime() ?? 0) ||
        right.rowID - left.rowID,
    );

  const page = matching.slice(skipped, skipped + pageSize);

  return {
    notes: page.map((row) => {
      const current = row.versions.at(-1);

      return {
        note: row.note,
        title: current?.title ?? '',
        tags: current?.tags ?? [],
        version: row.versions.length,
        updatedAt: current?.at ?? new Date(),
        backlinkCount: readMockBacklinks(row.note, showPrivate).length,
        isPrivate: row.isPrivate,
        match: pickMatch(current?.body ?? '', words),
      };
    }),
    next: matching.length > skipped + pageSize ? String(skipped + pageSize) : null,
    isMeaningPartial: words.length > 0,
  };
}

// The words' first hit in the body with a little text on each side, as the API's snippet is built.
function pickMatch(body: string, words: readonly string[]): string | null {
  const lower = body.toLowerCase();

  const hit = words
    .map((word) => ({ at: lower.indexOf(word), length: word.length }))
    .find((entry) => entry.at >= 0);

  return hit === undefined ? null : body.slice(Math.max(0, hit.at - 40), hit.at + hit.length + 40);
}
