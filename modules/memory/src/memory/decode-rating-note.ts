import { defineSealedCodec } from '../utils/codec/define-sealed-codec';
import type { RatingNotePlace } from '../utils/codec/sealed-codec';
import { sealedTextSchema } from '../utils/schema/sealed-text-schema';

const ratingNote = defineSealedCodec('rating-note/', sealedTextSchema);

export async function decodeRatingNote(
  key: CryptoKey,
  place: RatingNotePlace,
  sealed: string,
): Promise<string> {
  const note = await ratingNote.decode(key, `${place.ratingID}/${place.itemID}`, sealed);

  return note.text;
}
