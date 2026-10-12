import { z } from 'zod';
import { buildVersionKey } from './build-version-key';
import { decodeSealedJSON } from './decode-sealed-json';
import type { VersionRef, VersionText } from './types';

// Opens what encodeVersionText sealed. A wrong key, a wrong item or version, or a changed byte
// rejects.
export async function decodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  sealed: string,
): Promise<VersionText> {
  const value = await decodeSealedJSON(key, buildVersionKey(ref), sealed);

  return versionText.parse(value);
}

const versionText = z.strictObject({
  text: z.string(),
  evidenceQuote: z.string().nullable(),
  intentQuote: z.string().nullable(),
});
