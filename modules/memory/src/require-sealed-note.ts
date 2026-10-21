import type { Log } from '@heynixie/log';
import { encodeRatingNote } from './encode-rating-note';
import { MemoryRatingError } from './memory-rating-error';
import { readItemKey } from './read-item-key';

interface RatingNote {
  readonly ratingID: string;
  readonly itemID: string;

  readonly shortID: string;
  readonly note: string;
}

export async function requireSealedNote(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  note: RatingNote,
): Promise<string> {
  const key = await readItemKey(log, note.itemID);

  if (key === null || key === undefined) {
    throw new MemoryRatingError(`${note.shortID} was forgotten, so a note on it can't be kept.`);
  }

  return encodeRatingNote(key, { ratingID: note.ratingID, itemID: note.itemID }, note.note);
}
