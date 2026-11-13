import { defineSealedCodec } from './define-sealed-codec';
import type { RatingNotePlace } from './sealed-codec';
import { sealedTextSchema } from './sealed-text-schema';

const ratingNote = defineSealedCodec('rating-note/', sealedTextSchema);

export function encodeRatingNote(
  key: CryptoKey,
  place: RatingNotePlace,
  text: string,
): Promise<string> {
  return ratingNote.encode(key, `${place.ratingID}/${place.itemID}`, { text });
}
