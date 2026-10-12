import { z } from 'zod';
import { buildVersionKey } from './build-version-key';
import type { VersionRef, VersionText } from './types';

// Opens what encodeVersionText sealed. A wrong key, a wrong item or version, or a changed byte
// rejects.
export async function decodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  sealed: string,
): Promise<VersionText> {
  const bytes = new Uint8Array(Buffer.from(sealed, 'base64'));
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes.subarray(0, IV_BYTES),
      additionalData: new TextEncoder().encode(buildVersionKey(ref)),
    },
    key,
    bytes.subarray(IV_BYTES),
  );

  return versionText.parse(JSON.parse(new TextDecoder().decode(plaintext)));
}

const IV_BYTES = 12;

const versionText = z.strictObject({
  text: z.string(),
  evidenceQuote: z.string().nullable(),
  intentQuote: z.string().nullable(),
});
