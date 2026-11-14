import type { VersionRef, VersionText } from '../types';
import { defineSealedCodec } from '../utils/codec/define-sealed-codec';
import { buildVersionKey } from '../utils/key/build-version-key';
import { versionTextSchema } from './version-text-schema';

const versionText = defineSealedCodec('', versionTextSchema);

export function decodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  sealed: string,
): Promise<VersionText> {
  return versionText.decode(key, buildVersionKey(ref), sealed);
}
