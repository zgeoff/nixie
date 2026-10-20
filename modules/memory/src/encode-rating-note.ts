import { defineSealedCodec } from './define-sealed-codec';
import { sealedTextSchema } from './sealed-text-schema';
import type { RatingNotePlace } from './sealed-types';

const ratingNote = defineSealedCodec('rating-note/', sealedTextSchema);

// Seals the model's note on a rated item under the item's key, so a forget of that item makes the
// note unreadable too. The additional data keeps the ciphertext from opening as another rating's
// note or as another item's.
export function encodeRatingNote(
  key: CryptoKey,
  place: RatingNotePlace,
  text: string,
): Promise<string> {
  return ratingNote.encode(key, `${place.ratingID}/${place.itemID}`, { text });
}
