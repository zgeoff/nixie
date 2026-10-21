import { store } from './store';

interface RatingNoteRef {
  readonly itemID: string;
  readonly sequence: number;
}

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
