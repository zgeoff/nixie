import { store } from './store';

interface RatingNoteRef {
  readonly itemID: string;
  readonly sequence: number;
}

// Reads one rating's note from the mock store as nixie's API does: a readable note with its text,
// a shredded or unreadable one with none, and one the store lacks as missing.
export function readRatingNote(ref: RatingNoteRef) {
  const stored = store.ratingNotes.findFirst((query) =>
    query.where({ itemID: ref.itemID, sequence: ref.sequence }),
  );

  if (stored === undefined) {
    return { itemID: ref.itemID, sequence: ref.sequence, status: 'missing' as const };
  }

  return {
    itemID: stored.itemID,
    sequence: stored.sequence,
    status: stored.status,
    ...(stored.status === 'readable' && stored.text !== undefined ? { text: stored.text } : {}),
  };
}
