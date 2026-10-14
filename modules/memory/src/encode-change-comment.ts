import { encodeSealedJSON } from './encode-sealed-json';

// Seals the conversation's comment on a consolidation change under its first input's key, so a
// forget of that item makes the comment unreadable too. The additional data keeps the ciphertext
// from opening as another change's comment or as a change's text.
export function encodeChangeComment(
  key: CryptoKey,
  changeID: string,
  text: string,
): Promise<string> {
  return encodeSealedJSON(key, `consolidation-comment/${changeID}`, { text });
}
