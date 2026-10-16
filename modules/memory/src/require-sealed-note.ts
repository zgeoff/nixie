import type { Log } from '@heynixie/log';
import { encodeRatingNote } from './encode-rating-note';
import { findItemKey } from './find-item-key';
import { MemoryRatingError } from './memory-rating-error';

interface RatingNote {
  readonly ratingID: string;
  readonly itemID: string;

  // the ID the refusal names the item by, never the item's own ID
  readonly shortID: string;
  readonly note: string;
}

// Seals a rating's note under its item's key, and refuses a note on an item that a forget since the
// recall has removed.
export async function requireSealedNote(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  note: RatingNote,
): Promise<string> {
  const key = await findItemKey(log, note.itemID);

  if (key === null || key === undefined) {
    throw new MemoryRatingError(`${note.shortID} was forgotten, so a note on it can't be kept.`);
  }

  return encodeRatingNote(key, { ratingID: note.ratingID, itemID: note.itemID }, note.note);
}
