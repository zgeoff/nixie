import { buildVersionKey } from './build-version-key';
import { encodeSealedJSON } from './encode-sealed-json';
import type { VersionRef, VersionText } from './types';

// Seals a version's free text under its item's key. The item ID and version are the additional
// data, so a ciphertext copied under another item or version does not decrypt.
export function encodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  text: VersionText,
): Promise<string> {
  return encodeSealedJSON(key, buildVersionKey(ref), { ...text });
}
