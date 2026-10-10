import type { JSONObject } from './types';

// Encrypts a record's erasable fields with AES-256-GCM under its record key, as the 12-byte IV
// followed by the ciphertext. The key ID is the additional data, so a ciphertext copied to another
// record does not decrypt.
export async function encodeErasable(
  key: CryptoKey,
  keyID: string,
  fields: JSONObject,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(keyID) },
    key,
    new TextEncoder().encode(JSON.stringify(fields)),
  );
  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength);

  sealed.set(iv);
  sealed.set(new Uint8Array(ciphertext), IV_BYTES);
  return sealed;
}

const IV_BYTES = 12;
