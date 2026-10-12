import { buildVersionKey } from './build-version-key';
import type { VersionRef, VersionText } from './types';

// Seals a version's free text with AES-256-GCM under its item's key, as base64 of the 12-byte IV
// followed by the ciphertext. The item ID and version are the additional data, so a ciphertext
// copied under another item or version does not decrypt.
export async function encodeVersionText(
  key: CryptoKey,
  ref: VersionRef,
  text: VersionText,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(buildVersionKey(ref)) },
    key,
    new TextEncoder().encode(JSON.stringify(text)),
  );
  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength);

  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), IV_BYTES);
  return Buffer.from(sealed).toString('base64');
}

const IV_BYTES = 12;
