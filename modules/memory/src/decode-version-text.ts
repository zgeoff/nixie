import { buildVersionKey } from './build-version-key';
import { defineSealedCodec } from './define-sealed-codec';
import type { VersionRef, VersionText } from './types';
import { versionTextSchema } from './version-text-schema';

const versionText = defineSealedCodec('', versionTextSchema);

export function decodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  sealed: string,
): Promise<VersionText> {
  return versionText.decode(key, buildVersionKey(ref), sealed);
}
