import { buildVersionKey } from './build-version-key';
import { defineSealedCodec } from './define-sealed-codec';
import type { VersionRef, VersionText } from './types';
import { versionTextSchema } from './version-text-schema';

// no prefix: the version key alone is the additional data
const versionText = defineSealedCodec('', versionTextSchema);

// Seals a version's free text under its item's key. The item ID and version are the additional
// data, so a ciphertext copied under another item or version does not decrypt.
export function encodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  text: VersionText,
): Promise<string> {
  return versionText.encode(key, buildVersionKey(ref), text);
}
