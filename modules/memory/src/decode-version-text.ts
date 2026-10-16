import { buildVersionKey } from './build-version-key';
import { defineSealedCodec } from './define-sealed-codec';
import type { VersionRef, VersionText } from './types';
import { versionTextSchema } from './version-text-schema';

// Opens what encodeVersionText sealed. A wrong key, a wrong item or version, or a changed byte
// rejects.
export function decodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  sealed: string,
): Promise<VersionText> {
  return versionText.decode(key, buildVersionKey(ref), sealed);
}

// no prefix: the version key alone is the additional data
const versionText = defineSealedCodec('', versionTextSchema);
