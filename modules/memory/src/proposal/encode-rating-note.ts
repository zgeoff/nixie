import { defineSealedCodec } from '../utils/codec/define-sealed-codec';
import type { RatingNotePlace } from '../utils/codec/sealed-codec';
import { sealedTextSchema } from '../utils/schema/sealed-text-schema';

const ratingNote = defineSealedCodec('rating-note/', sealedTextSchema);

export function encodeRatingNote(
  key: CryptoKey,
  place: RatingNotePlace,
  text: string,
): Promise<string> {
  return ratingNote.encode(key, `${place.ratingID}/${place.itemID}`, { text });
}
