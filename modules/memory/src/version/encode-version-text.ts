import type { VersionRef, VersionText } from '../types';
import { defineSealedCodec } from '../utils/codec/define-sealed-codec';
import { buildVersionKey } from '../utils/key/build-version-key';
import { versionTextSchema } from './version-text-schema';

const versionText = defineSealedCodec('', versionTextSchema);

export function encodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  text: VersionText,
): Promise<string> {
  return versionText.encode(key, buildVersionKey(ref), text);
}
