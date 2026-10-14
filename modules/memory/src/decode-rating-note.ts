import { z } from 'zod';
import { decodeSealedJSON } from './decode-sealed-json';
import type { RatingNotePlace } from './encode-rating-note';

// Opens what encodeRatingNote sealed. A wrong key, another rating's or item's ID, or a changed byte
// rejects.
export async function decodeRatingNote(
  key: CryptoKey,
  place: RatingNotePlace,
  sealed: string,
): Promise<string> {
  const value = await decodeSealedJSON(
    key,
    `rating-note/${place.ratingID}/${place.itemID}`,
    sealed,
  );

  return ratingNote.parse(value).text;
}

const ratingNote = z.strictObject({ text: z.string() });
