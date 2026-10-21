import { buildVersionKey } from './build-version-key';
import { defineSealedCodec } from './define-sealed-codec';
import type { VersionRef, VersionText } from './types';
import { versionTextSchema } from './version-text-schema';

const versionText = defineSealedCodec('', versionTextSchema);

export function encodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  text: VersionText,
): Promise<string> {
  return versionText.encode(key, buildVersionKey(ref), text);
}
