import { defineSealedCodec } from './define-sealed-codec';
import { sealedTextSchema } from './sealed-text-schema';
import type { RatingNotePlace } from './sealed-types';

const ratingNote = defineSealedCodec('rating-note/', sealedTextSchema);

export async function decodeRatingNote(
  key: CryptoKey,
  place: RatingNotePlace,
  sealed: string,
): Promise<string> {
  const note = await ratingNote.decode(key, `${place.ratingID}/${place.itemID}`, sealed);

  return note.text;
}
