import { encodeSealedJSON } from './encode-sealed-json';

// Where a note belongs: the rating that holds it and the item it rates.
export interface RatingNotePlace {
  readonly ratingID: string;
  readonly itemID: string;
}

// Seals the model's note on a rated item under the item's key, so a forget of that item makes the
// note unreadable too. The additional data keeps the ciphertext from opening as another rating's
// note or as another item's.
export function encodeRatingNote(
  key: CryptoKey,
  place: RatingNotePlace,
  text: string,
): Promise<string> {
  return encodeSealedJSON(key, `rating-note/${place.ratingID}/${place.itemID}`, { text });
}
